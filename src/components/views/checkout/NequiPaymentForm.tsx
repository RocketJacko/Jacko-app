import React, { useState, useEffect, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { NequiLogoSVG, BreBLogoSVG } from './Logos';
import type { PaymentMethod, PricingPlan, ReceiptData } from './types';
import { PaymentHandlerFactory } from '../../../lib/payments/PaymentHandlerFactory';
import { supabase } from '../../../lib/supabaseClient';
import { invalidateCache, invalidateCacheByPrefix } from '../../../lib/queryCache';

interface NequiPaymentFormProps {
  selectedMethod: PaymentMethod;
  productId: string;
  productTitle: string;
  quantity: number;
  userId: string;
  selectedPlan: PricingPlan | null;
  totalPrice: number;
  formatMoney: (amount: number) => string;
  isProcessing: boolean;
  onProcessingChange: (processing: boolean) => void;
  onPaymentSuccess: (orderId: string, receipt: ReceiptData) => void;
  onPaymentError: (error: string) => void;
  onBackToCatalog: () => void;
  guestEmail?: string;
  guestName?: string;
  exchangeRate: number;
}

const BANCOS = [
  'Nequi App',
  'Davivienda',
  'Bancolombia',
  'Banco de Bogotá',
  'BBVA',
  'Banco Popular',
  'Banco Caja Social',
  'Colpatria',
  'Itaú',
  'Scotiabank Colpatria',
  'Banco Falabella',
  'Nequi desde otro banco',
  'Otro',
];

export function NequiPaymentForm({
  selectedMethod,
  productId,
  productTitle,
  quantity,
  userId,
  selectedPlan,
  totalPrice,
  formatMoney,
  isProcessing,
  onProcessingChange,
  onPaymentSuccess,
  onPaymentError,
  onBackToCatalog,
  guestEmail,
  guestName,
  exchangeRate,
}: NequiPaymentFormProps) {
  // Form states
  const [payerName, setPayerName] = useState('');
  const [bankName, setBankName] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Flow states
  const [nequiState, setNequiState] = useState<'form' | 'waiting' | 'timeout'>('form');
  const [nequiOrderId, setNequiOrderId] = useState<string | null>(null);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [copied, setCopied] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Clean resources on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onPaymentError('Solo se admiten imágenes (JPG, PNG, WEBP, HEIC).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onPaymentError('La imagen no puede superar 5 MB.');
      return;
    }
    setImageFile(file);
    onPaymentError('');
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  };

  const handleCopyKey = () => {
    const key = selectedMethod.account_value || '0092019956';
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executeNequiPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    onPaymentError('');

    const finalPayerName = payerName.trim() || guestName || '';

    if (!finalPayerName || finalPayerName.length < 3) {
      onPaymentError('Ingresa el nombre completo del pagador (mínimo 3 caracteres).');
      return;
    }
    if (!bankName) {
      onPaymentError('Selecciona el banco o entidad desde donde realizaste el pago.');
      return;
    }
    if (!paymentDate) {
      onPaymentError('Selecciona la fecha del pago.');
      return;
    }
    if (!imageFile) {
      onPaymentError('Sube el comprobante de pago (screenshot del banco o de la app Nequi).');
      return;
    }

    onProcessingChange(true);
    const isBreB = selectedMethod.type === 'bre_b';

    try {
      const handler = PaymentHandlerFactory.getHandler(selectedMethod.type as 'nequi' | 'bre_b');
      const response = await handler.initiate({
        productId,
        paymentMethodType: selectedMethod.type,
        quantity,
        userId,
        payerName: payerName.trim() || guestName || '',
        bankName,
        paymentDate,
        planId: selectedPlan?.id,
        guestEmail,
        guestName,
        exchangeRate,
      });

      if (!response.success || !response.orderId) {
        throw new Error(response.error || 'Error al iniciar la orden con Nequi.');
      }

      const orderId = response.orderId;
      setNequiOrderId(orderId);

      // Upload file to the storage bucket using the presigned URL
      if (response.uploadUrl && imageFile) {
        const uploadRes = await fetch(response.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': imageFile.type },
          body: imageFile,
        });
        if (!uploadRes.ok) {
          console.warn('Advertencia: no se pudo subir el comprobante:', await uploadRes.text());
        }
      }

      // Invalidate frontend cache
      invalidateCacheByPrefix('catalog_products');
      invalidateCache('dashboard_data_' + userId);

      // Instant approval webhook matching
      if (response.alreadyApproved) {
        const receipt: ReceiptData = {
          title: '¡Pago Confirmado!',
          subtitle: 'Tu pago fue verificado automáticamente.',
          amount: formatMoney(totalPrice),
          statusLabel: 'APROBADO',
          statusType: 'success',
          date: new Date().toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          method: isBreB ? 'Bre-B' : 'Nequi',
          referenceId: orderId,
          productTitle,
        };

        onPaymentSuccess(orderId, receipt);
        return;
      }

      // Enter waiting/countdown state
      setNequiState('waiting');
      setElapsedSecs(0);

      // Set up real-time listener for order approval
      const channel = supabase
        .channel(`nequi-checkout-${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const status = payload.new?.status;
            if (status === 'approved') {
              setNequiState('form');
              if (timerRef.current) clearInterval(timerRef.current);
              invalidateCacheByPrefix('catalog_products');
              invalidateCache('dashboard_data_' + userId);

              const receipt: ReceiptData = {
                title: '¡Pago Confirmado!',
                subtitle: 'Tu pago fue verificado exitosamente por el sistema.',
                amount: formatMoney(totalPrice),
                statusLabel: 'APROBADO',
                statusType: 'success',
                date: new Date().toLocaleDateString('es-CO', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }),
                method: isBreB ? 'Bre-B / Transferencia' : 'Nequi / Transferencia',
                referenceId: orderId,
                productTitle,
              };

              onPaymentSuccess(orderId, receipt);
            }
          }
        )
        .subscribe();

      realtimeChannelRef.current = channel;

      timerRef.current = setInterval(() => {
        setElapsedSecs((s) => {
          const next = s + 1;
          if (next >= 1800) { // 30 minutes timeout
            if (timerRef.current) clearInterval(timerRef.current);
            setNequiState('timeout');
          }
          return next;
        });
      }, 1000);

    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago con Nequi.';
      onPaymentError(msg);
    } finally {
      onProcessingChange(false);
    }
  };

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isBreB = selectedMethod.type === 'bre_b';

  return (
    <div className="nequi-flow-container">
      {nequiState === 'form' && (
        <form onSubmit={executeNequiPayment} className="nequi-form-wrapper">
          <div className="nequi-info-header">
            <div className="nequi-form-logo" style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              {selectedMethod.qr_image_url ? (
                <img src={selectedMethod.qr_image_url} alt={selectedMethod.name} className="brand-logo-img-large" />
              ) : isBreB ? (
                <BreBLogoSVG />
              ) : (
                <NequiLogoSVG />
              )}
            </div>
            <p>Realiza tu transferencia {isBreB ? 'Bre-B' : 'Nequi'} desde cualquier banco.</p>
            <div className="nequi-key-display">
              <span className="nequi-key-label">{isBreB ? 'Llave Bre-B' : 'Llave Nequi'}:</span>
              <strong className="nequi-key-value">{selectedMethod.account_value || '0092019956'}</strong>
              <button
                type="button"
                className="nequi-copy-button"
                onClick={handleCopyKey}
              >
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="nequi-input-fields">
            <div className="nequi-input-group">
              <label htmlFor="nequi-payer-name-input">Nombre del Pagador *</label>
              <input
                id="nequi-payer-name-input"
                type="text"
                className="nequi-text-input"
                placeholder="Ej. DANIEL EDUARDO SOLARTE"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                disabled={isProcessing}
                required={!guestName}
              />
            </div>

            <div className="nequi-input-group">
              <label htmlFor="nequi-bank-name-select">Banco Origen *</label>
              <select
                id="nequi-bank-name-select"
                className="nequi-select-input"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                disabled={isProcessing}
                required
              >
                <option value="">Selecciona un banco...</option>
                {BANCOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="nequi-input-group">
              <label htmlFor="nequi-payment-date-input">Fecha del Pago *</label>
              <input
                id="nequi-payment-date-input"
                type="date"
                className="nequi-text-input"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={isProcessing}
                max={new Date().toISOString().split('T')[0]}
                required
              />
              <span className="nequi-date-hint">
                Fecha exacta en el comprobante
              </span>
            </div>

            <div className="nequi-input-group">
              <label>Comprobante de Pago *</label>
              {imagePreview ? (
                <div className="nequi-image-preview-box">
                  <img
                    src={imagePreview}
                    alt="Comprobante"
                    className="preview-thumbnail"
                  />
                  <div className="preview-info">
                    <span className="preview-name">{imageFile?.name}</span>
                    <span className="preview-size">
                      {imageFile && (imageFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    className="remove-preview-btn"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  className={`nequi-upload-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="upload-icon-wrapper" size={24} />
                  <span className="upload-main-text">
                    Sube una imagen o arrástrala
                  </span>
                  <span className="upload-sub-text">
                    JPG, PNG, WEBP · Máx 5 MB
                  </span>
                  <input
                    aria-label="Subir comprobante de pago"
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageSelect(f);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="checkout-action-button"
            style={{ marginTop: '20px' }}
            disabled={isProcessing || !payerName.trim() || !bankName || !imageFile}
          >
            {isProcessing ? 'Procesando...' : 'Pagar Ahora'}
          </button>
        </form>
      )}

      {nequiState === 'waiting' && (
        <div className="nequi-waiting-container">
          <div className="nequi-loading-spinner">
            <svg viewBox="0 0 60 60">
              <circle className="spinner-track" cx="30" cy="30" r="26" />
              <circle className="spinner-value" cx="30" cy="30" r="26" />
            </svg>
            <div className="nequi-waiting-dot-center" />
          </div>

          <h4>Verificando tu pago...</h4>
          <p>
            Estamos esperando la confirmación de {isBreB ? 'Bre-B' : 'Nequi'}. Esto suele tomar menos
            de un minuto.
          </p>

          <div className="nequi-waiting-timer">
            <span>Tiempo transcurrido: </span>
            <strong>{formatElapsed(elapsedSecs)}</strong>
          </div>

          <div className="nequi-waiting-bulletpoints">
            <p>Tu comprobante fue subido correctamente</p>
            <p>No cierres ni recargues esta ventana</p>
            <p>El producto se activará automáticamente al confirmarse</p>
          </div>
        </div>
      )}

      {nequiState === 'timeout' && (
        <div className="nequi-timeout-container">
          <div className="nequi-timeout-icon">⏳</div>
          <h4>Verificación en proceso</h4>
          <p>
            Tu pago y comprobante fueron recibidos. Nuestro equipo lo verificará
            manualmente y recibirás acceso a tu producto en las próximas horas.
          </p>
          {nequiOrderId && (
            <p className="nequi-order-ref">
              ID de Orden: <code>{nequiOrderId.substring(0, 8)}</code>
            </p>
          )}
          <button
            type="button"
            className="checkout-action-button"
            onClick={onBackToCatalog}
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}
