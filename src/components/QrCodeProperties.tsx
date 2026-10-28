import React, { useEffect, useState } from 'react';
import { Download, QrCode } from 'lucide-react';
import type { IconLayer, MutationOperation } from '../types/sceneGraph';

interface QrCodePropertiesProps {
  layer: IconLayer;
  onExecuteMutation: (operation: MutationOperation) => void;
}

export const QrCodeProperties: React.FC<QrCodePropertiesProps> = ({ layer, onExecuteMutation }) => {
  const [destination, setDestination] = useState(
    layer.type_specific.qr_value ?? layer.type_specific.svg_or_path_data ?? ''
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDestination(layer.type_specific.qr_value ?? layer.type_specific.svg_or_path_data ?? '');
    setError(null);
  }, [layer.id, layer.type_specific.qr_value, layer.type_specific.svg_or_path_data]);

  const regenerate = async () => {
    const value = destination.trim();
    if (!value) {
      setError('Enter a destination before generating the QR code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { default: QRCode } = await import('qrcode');
      const imageUrl = await QRCode.toDataURL(value, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 1024,
        color: { dark: '#000000', light: '#ffffff' }
      });
      onExecuteMutation({
        type: 'update_qr',
        layer_id: layer.id,
        params: { value, image_url: imageUrl },
        description: 'Regenerated QR code'
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate this QR code.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const value = destination.trim();
    if (!value) {
      setError('Enter a destination before downloading the QR code.');
      return;
    }
    setError(null);
    try {
      const { default: QRCode } = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(value, {
        errorCorrectionLevel: 'H',
        margin: 4,
        width: 2048,
        color: { dark: '#000000', light: '#ffffff' }
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'qr-code-2048.png';
      link.click();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download this QR code.');
    }
  };

  return (
    <section className="space-y-3 border-b border-neutral-800 p-3.5" aria-label="QR code destination">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
        <QrCode className="h-4 w-4 text-sky-300" /> QR destination
      </h2>
      {layer.source.warning_flags?.includes('qr_decode_unreliable') && (
        <p role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-5 text-amber-100">
          The destination could not be decoded reliably. The original QR is preserved as a cropped image; enter a destination to regenerate it.
        </p>
      )}
      <label className="block space-y-1 text-xs text-neutral-300">
        Destination or text
        <input
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void regenerate();
          }}
          className="min-h-11 w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 text-sm text-neutral-100 outline-none focus:border-sky-500"
          aria-label="QR destination or text"
        />
      </label>
      {layer.type_specific.qr_decoded_ok && (
        <p className="break-all text-xs text-neutral-400">Decoded: {layer.type_specific.qr_value ?? destination}</p>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void regenerate()}
          disabled={busy || !destination.trim()}
          className="min-h-11 rounded bg-sky-500 px-2 text-xs font-semibold text-neutral-950 hover:bg-sky-400 disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Regenerate QR'}
        </button>
        <button
          type="button"
          onClick={() => void download()}
          disabled={!destination.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded border border-neutral-700 px-2 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download 2048px
        </button>
      </div>
    </section>
  );
};
