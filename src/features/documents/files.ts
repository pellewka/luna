import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Attachment } from '../../domain/medical';

type PickedFile = { uri: string; name: string; mimeType: string; size: number };
export type AttachmentDraft = Attachment | PickedFile;
const folder = () => new Directory(Paths.document, 'luna-attachments');

export function attachmentUri(attachment: AttachmentDraft): string {
  return 'uri' in attachment ? attachment.uri : new File(folder(), attachment.fileKey).uri;
}

export async function pickAttachment(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const selected = result.assets[0];
  const file = new File(selected.uri);
  const size = file.size;
  if (!size || size > 15 * 1024 * 1024)
    throw new Error('Выберите PDF или изображение размером до 15 МБ.');
  const mimeType =
    selected.mimeType ||
    file.type ||
    (selected.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/'))
    throw new Error('Поддерживаются PDF и изображения.');
  return { uri: selected.uri, name: selected.name.slice(0, 200), mimeType, size };
}

export function saveAttachment(draft?: AttachmentDraft): Attachment | undefined {
  if (!draft || !('uri' in draft)) return draft;
  const directory = folder();
  directory.create({ intermediates: true, idempotent: true });
  const extension =
    draft.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1].toLowerCase() ||
    (draft.mimeType === 'application/pdf' ? 'pdf' : 'jpg');
  const fileKey = `luna-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const target = new File(directory, fileKey);
  new File(draft.uri).copy(target);
  return { fileKey, name: draft.name, mimeType: draft.mimeType, size: draft.size };
}

export function removeAttachment(attachment?: Attachment) {
  if (!attachment) return;
  const file = new File(folder(), attachment.fileKey);
  if (file.exists) file.delete();
}

export function removeAllAttachments() {
  const directory = folder();
  if (directory.exists) directory.delete();
}

export function persistAttachmentChange(
  previous: Attachment | undefined,
  draft: AttachmentDraft | undefined,
  persist: (attachment?: Attachment) => boolean,
): string | null {
  const attachment = saveAttachment(draft);
  if (!persist(attachment)) {
    if (attachment?.fileKey !== previous?.fileKey) removeAttachment(attachment);
    throw new Error('Сначала восстановите доступ к записям.');
  }
  try {
    if (previous?.fileKey !== attachment?.fileKey) removeAttachment(previous);
    return null;
  } catch {
    return 'Запись сохранена, но старую копию файла удалить не удалось.';
  }
}

export async function shareAttachment(attachment: AttachmentDraft) {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Меню файлов недоступно на этом устройстве.');
  const uri = attachmentUri(attachment);
  if (!new File(uri).exists) throw new Error('Файл не найден. Прикрепите его заново.');
  await Sharing.shareAsync(uri, { mimeType: attachment.mimeType, dialogTitle: attachment.name });
}
