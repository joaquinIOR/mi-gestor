import { clearDocuments, listDocuments, saveDocument } from './documentsDb';
import { blobToDataUrl, dataUrlToBlob } from './images';
import { todayKey } from './dates';

const APP_ID = 'mi-gestor';

export async function exportBackup(state) {
  const documents = await Promise.all(
    (await listDocuments()).map(async (doc) => ({
      ...doc,
      images: await Promise.all(doc.images.map(blobToDataUrl)),
    }))
  );
  const data = { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), ...state, documents };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mi-gestor-${todayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Lee un archivo de copia, restaura los documentos y devuelve el resto de datos.
export async function readBackup(file) {
  const data = JSON.parse(await file.text());
  if (data?.app !== APP_ID) throw new Error('El archivo no es una copia de Mi Gestor.');

  await clearDocuments();
  for (const doc of data.documents ?? []) {
    await saveDocument({ ...doc, images: await Promise.all((doc.images ?? []).map(dataUrlToBlob)) });
  }
  return {
    movements: data.movements ?? [],
    notes: data.notes ?? [],
    categories: data.categories ?? { expense: [], income: [] },
    settings: data.settings,
  };
}
