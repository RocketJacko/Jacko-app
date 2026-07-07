import os
import zipfile
import xml.etree.ElementTree as ET

def dump_xlsx_shared_strings(file_path):
    try:
        with zipfile.ZipFile(file_path, 'r') as z:
            # Shared strings contains the text values of cells
            for name in z.namelist():
                if 'sharedStrings.xml' in name:
                    content = z.read(name)
                    root = ET.fromstring(content)
                    print(f"--- Shared Strings in {os.path.basename(file_path)} ---")
                    # In sharedStrings.xml, each text item is in <si><t>text</t></si>
                    # We look for <t> tags
                    namespaces = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                    texts = root.findall('.//ns:t', namespaces)
                    if not texts:
                        # try without namespace
                        texts = root.findall('.//t')
                    for i, t in enumerate(texts):
                        print(f"Cell text {i}: {t.text}")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

file_path = "C:/Users/JesusAlexisCarmonaCa/Desktop/Herramientas de travbajo.xlsx"
if os.path.exists(file_path):
    dump_xlsx_shared_strings(file_path)
else:
    # Try looking for other excel files or lists
    print("File does not exist at", file_path)
