import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Folder,
  FileText,
  Image as ImageIcon,
  File,
  ArrowLeft,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import './admin-components.css';
import '../../styles/data-table.css';

interface StorageItem {
  name: string;
  id: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    size: number;
    mimetype: string;
  };
  isFolder?: boolean;
}

export function StorageManager({
  refreshTrigger,
  uploadTrigger,
}: {
  refreshTrigger?: number;
  uploadTrigger?: number;
}) {
  const [buckets, setBuckets] = useState<{ id: string; name: string; public: boolean }[]>([]);
  const [bucket, setBucket] = useState<string>('resources');
  const [currentPath, setCurrentPath] = useState<string>(''); // Vacío es el root del bucket
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload and Action states
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeBucket = buckets.find((b) => b.id === bucket);
  const isPublic = activeBucket ? activeBucket.public : true;

  // Get full file path
  const getFullPath = (fileName: string) => {
    return currentPath ? `${currentPath}/${fileName}` : fileName;
  };

  // Load files and folders
  const loadFiles = useCallback(
    async (targetBucket = bucket, path = currentPath) => {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data, error } = await supabase.storage.from(targetBucket).list(path, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error) throw error;

        const formattedItems: StorageItem[] = (data || [])
          .map((item) => {
            const isFolder = !item.id && !item.metadata;
            return {
              name: item.name,
              id: item.id || '',
              created_at: item.created_at || '',
              updated_at: item.updated_at || '',
              metadata: item.metadata
                ? { size: item.metadata.size, mimetype: item.metadata.mimetype }
                : undefined,
              isFolder: isFolder || item.name === '.emptyFolderPlaceholder',
            };
          })
          .filter((item) => item.name !== '.emptyFolderPlaceholder');

        setItems(formattedItems);
      } catch (err: unknown) {
        console.error('Error listing storage files:', err);
        setErrorMsg(
          'Error al listar archivos: ' + (err instanceof Error ? err.message : String(err))
        );
      } finally {
        setLoading(false);
      }
    },
    [bucket, currentPath]
  );

  // Load buckets on mount
  useEffect(() => {
    let active = true;
    const loadBuckets = async () => {
      try {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) throw error;
        if (active && data && data.length > 0) {
          setBuckets(data);
          const hasResources = data.find((b) => b.id === 'resources');
          setBucket(hasResources ? 'resources' : data[0].id);
        }
      } catch (err) {
        console.warn('Error fetching storage buckets dynamically:', err);
        if (active) {
          const fallback = [
            { id: 'resources', name: 'resources', public: true },
            { id: 'avatars', name: 'avatars', public: true },
            { id: 'thumbnails', name: 'thumbnails', public: true },
            { id: 'payment-qrs', name: 'payment-qrs', public: true },
            { id: 'products', name: 'products', public: false },
            { id: 'proofs', name: 'proofs', public: false },
            { id: 'pictureUsers', name: 'pictureUsers', public: true },
          ];
          setBuckets(fallback);
          setBucket('resources');
        }
      }
    };
    loadBuckets();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      await Promise.resolve();
      if (active && bucket) {
        loadFiles();
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [loadFiles, bucket]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const run = async () => {
        await Promise.resolve();
        loadFiles();
      };
      run();
    }
  }, [refreshTrigger, loadFiles]);

  useEffect(() => {
    if (uploadTrigger && uploadTrigger > 0) {
      fileInputRef.current?.click();
    }
  }, [uploadTrigger]);

  // Navigate down into a folder
  const handleEnterFolder = (folderName: string) => {
    const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(nextPath);
  };

  // Navigate up
  const handleGoBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  // Format bytes
  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // File type icons helper
  const getFileIcon = (item: StorageItem) => {
    if (item.isFolder) return <Folder />;
    const mime = item.metadata?.mimetype || '';
    if (mime.startsWith('image/')) {
      if (isPublic) {
        const publicUrl = supabase.storage.from(bucket).getPublicUrl(getFullPath(item.name)).data
          .publicUrl;
        return <img src={publicUrl} alt={item.name} className="dt-thumb" loading="lazy" />;
      }
      return <ImageIcon />;
    }
    if (mime.includes('pdf') || mime.includes('text') || mime.includes('document')) {
      return <FileText />;
    }
    return <File />;
  };

  // Copy Link (Handles public URLs vs private signed URLs)
  const handleCopyLink = async (fileName: string) => {
    setErrorMsg('');
    setActionLoading(true);
    const fullPath = getFullPath(fileName);
    try {
      let url = '';
      if (isPublic) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
        url = data.publicUrl;
      } else {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(fullPath, 86400);
        if (error) throw error;
        url = data.signedUrl;
      }
      await navigator.clipboard.writeText(url);
      setCopiedPath(fullPath);
      setSuccessMsg('Enlace copiado al portapapeles.');
      setTimeout(() => setCopiedPath(null), 1500);
    } catch (err: unknown) {
      console.error('Error copying file link:', err);
      setErrorMsg(
        'No se pudo generar el enlace: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Delete file
  const handleDeleteFile = async (item: StorageItem) => {
    const fullPath = getFullPath(item.name);
    if (item.isFolder) {
      setErrorMsg(
        'Eliminar carpetas no está soportado directamente por RLS/API. Debes vaciar sus archivos internos primero.'
      );
      return;
    }
    if (!confirm(`¿Estás seguro de que quieres eliminar el archivo "${item.name}"?`)) {
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await supabase.storage.from(bucket).remove([fullPath]);
      if (error) throw error;
      // Log auditoría
      await supabase.rpc('admin_log_action', {
        _action: 'delete_storage_file',
        _target_table: 'storage.objects',
        _target_id: null,
        _payload: { bucket, path: fullPath },
      });
      setSuccessMsg('Archivo eliminado.');
      await loadFiles();
    } catch (err: unknown) {
      console.error('Error deleting file:', err);
      setErrorMsg(
        'Error al eliminar el archivo: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setActionLoading(false);
    }
  };

  // Handle uploading files
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setErrorMsg('');
    setSuccessMsg('');
    let successCount = 0;
    let failedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fullPath = currentPath ? `${currentPath}/${sanitizedName}` : sanitizedName;
      try {
        const { error } = await supabase.storage.from(bucket).upload(fullPath, file, {
          cacheControl: '3600',
          upsert: true,
        });
        if (error) throw error;
        // Log auditoría
        await supabase.rpc('admin_log_action', {
          _action: 'upload_storage_file',
          _target_table: 'storage.objects',
          _target_id: null,
          _payload: { bucket, path: fullPath },
        });
        successCount++;
      } catch (err: unknown) {
        console.error(`Error uploading ${file.name}:`, err);
        failedCount++;
      }
    }
    if (successCount > 0) {
      setSuccessMsg(`Se subieron con éxito ${successCount} archivo(s).`);
    }
    if (failedCount > 0) {
      setErrorMsg(`Error al subir ${failedCount} archivo(s). Revisa las políticas de RLS.`);
    }
    await loadFiles();
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="admin-panel-container">
      {/* Messages */}
      {errorMsg && <div className="admin-error-banner" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}
      {successMsg && <div className="admin-success-banner" style={{ marginBottom: '1.5rem', background: '#dcfce7', color: '#15803d', padding: '12px', borderRadius: '12px', fontWeight: 700 }}>{successMsg}</div>}

      <div className="admin-editor-card" style={{ background: '#ffffff', border: '1.5px solid var(--beige-dark)', padding: '24px', borderRadius: '20px' }}>
        <div className="admin-editor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--beige-light)', paddingBottom: '12px' }}>
          <h3 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 800 }}>Explorador de Archivos (Bucket: {bucket})</h3>
        </div>

        <input
          aria-label="Subir archivos"
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleUploadFile}
          disabled={uploading}
        />

        {uploading && (
          <div className="admin-loading" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
            <p>Subiendo archivos...</p>
          </div>
        )}

        {/* Storage Items List */}
        {loading ? (
          <div className="admin-loading" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px auto' }}></div>
            <p>Listando recursos en {bucket}...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-panel-state" style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--beige-dark)', borderRadius: '20px' }}>
            <Folder size={48} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
            <h4>Carpeta o bucket vacío</h4>
            {currentPath ? (
              <div style={{ marginTop: '10px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.9rem', opacity: 0.7 }}>Esta carpeta no tiene archivos.</p>
                <button
                  type="button"
                  className="btn-admin-secondary admin-btn-back"
                  onClick={handleGoBack}
                >
                  <ArrowLeft size={14} /> Subir de nivel
                </button>
              </div>
            ) : (
              <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>Este bucket no contiene archivos ni carpetas.</p>
            )}
          </div>
        ) : (
          <div>
            {/* Separate rendering for folders in visual cards, then files in list */}
            {items.filter((item) => item.isFolder).length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--brown-dark)', opacity: 0.6, marginBottom: '0.75rem' }}>
                  Carpetas
                </h4>
                <div className="storage-folders-grid">
                  {currentPath && (
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.currentTarget.click();
                        }
                      }}
                      className="folder-card-premium"
                      onClick={handleGoBack}
                    >
                      <ArrowLeft size={18} style={{ color: 'var(--orange-base)' }} />
                      <span className="folder-card-name">.. (Carpeta superior)</span>
                    </div>
                  )}
                  {items
                    .filter((item) => item.isFolder)
                    .map((folder, index) => (
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.currentTarget.click();
                          }
                        }}
                        className="folder-card-premium"
                        key={index}
                        onClick={() => handleEnterFolder(folder.name)}
                      >
                        <Folder size={18} style={{ color: 'var(--orange-base)' }} />
                        <span className="folder-card-name" title={folder.name}>
                          {folder.name}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {items.filter((item) => !item.isFolder).length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--brown-dark)', opacity: 0.6, marginBottom: '0.75rem' }}>
                  Archivos
                </h4>
                <div className="dt-container">
                  <div className="dt-table-wrapper">
                    <table className="dt-table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Tamaño</th>
                          <th>Modificado</th>
                          <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items
                          .filter((item) => !item.isFolder)
                          .map((item, index) => (
                            <tr key={index}>
                              <td>
                                <div className="dt-cell-name">
                                  <div className="dt-avatar" style={{ margin: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {getFileIcon(item)}
                                  </div>
                                  <strong title={item.name} style={{ marginLeft: '10px' }}>{item.name}</strong>
                                </div>
                              </td>
                              <td>
                                <span className="dt-date-main">
                                  {formatBytes(item.metadata?.size)}
                                </span>
                              </td>
                              <td>
                                <span className="dt-date-hint">
                                  {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div className="dt-actions-group" style={{ justifyContent: 'flex-end', display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="dt-row-btn edit"
                                    onClick={() => handleCopyLink(item.name)}
                                    disabled={actionLoading}
                                    title={isPublic ? 'Copiar URL Pública' : 'Copiar URL Firmada (24h)'}
                                    style={{ position: 'relative' }}
                                  >
                                    <Copy size={13} />
                                    {copiedPath === getFullPath(item.name) && (
                                      <span className="dt-tooltip-copied">Copiado</span>
                                    )}
                                  </button>
                                  {isPublic && (
                                    <a
                                      href={
                                        supabase.storage
                                          .from(bucket)
                                          .getPublicUrl(getFullPath(item.name)).data.publicUrl
                                      }
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      title="Ver en pestaña nueva"
                                      className="dt-row-btn"
                                    >
                                      <ExternalLink size={13} />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    className="dt-row-btn danger"
                                    onClick={() => handleDeleteFile(item)}
                                    disabled={actionLoading}
                                    title="Eliminar Archivo"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="dt-table-footer">
                    <span className="dt-total-count">
                      {items.filter((item) => !item.isFolder).length}{' '}
                      {items.filter((item) => !item.isFolder).length === 1 ? 'archivo' : 'archivos'} en total
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}