import { useState, useCallback, useEffect, type ChangeEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X, Check, Image as ImageIcon, WifiOff } from 'lucide-react';

export interface ImageUploaderProps {
  value: string | Blob | File | null;
  onChange: (fileOrUrl: string | Blob | File | null) => void;
  requireCrop?: boolean;
  defaultAspect?: number;
  allowToggle?: boolean;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

export function ImageUploader({
  value,
  onChange,
  requireCrop = false,
  defaultAspect = 4 / 3,
  allowToggle = true,
}: ImageUploaderProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [currentAspect, setCurrentAspect] = useState<number>(defaultAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    if (typeof value === 'string') {
      setPreviewUrl(value);
    } else if (value instanceof Blob || value instanceof File) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [value]);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (requireCrop) {
        const reader = new FileReader();
        reader.addEventListener('load', () => setSelectedImage(reader.result as string));
        reader.readAsDataURL(file);
      } else {
        onChange(file);
      }
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Canvas rendering context is not available');

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas crop export failed'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  };

  const handleConfirmCrop = async () => {
    if (!selectedImage || !croppedAreaPixels) return;
    try {
      const croppedBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      onChange(croppedBlob);
      setSelectedImage(null);
    } catch (err) {
      console.error('[ImageUploader] Crop failed:', err);
    }
  };

  // 1. Render Active Image Preview
  if (previewUrl && !selectedImage) {
    return (
      <div
        className="relative bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden group max-w-sm shadow-xs"
        style={{ aspectRatio: currentAspect, maxHeight: '250px' }}
      >
        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover shadow-inner" />
        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-3">
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg cursor-pointer transition-all active:scale-95"
          >
            <X size={14} /> Remove Photo
          </button>
        </div>
      </div>
    );
  }

  // 2. Render Crop Modal
  if (selectedImage && requireCrop) {
    return (
      <div className="fixed inset-0 z-[120] bg-slate-950/90 flex flex-col backdrop-blur-md animate-in fade-in duration-200">
        {allowToggle && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[130] flex bg-slate-900/90 rounded-2xl p-1 gap-1 border border-slate-800 shadow-2xl">
            <button
              type="button"
              onClick={() => setCurrentAspect(4 / 3)}
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                currentAspect === 4 / 3 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Landscape 4:3
            </button>
            <button
              type="button"
              onClick={() => setCurrentAspect(3 / 4)}
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                currentAspect === 3 / 4 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Portrait 3:4
            </button>
            <button
              type="button"
              onClick={() => setCurrentAspect(2 / 1)}
              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer ${
                currentAspect === 2 / 1 ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              Map 2:1
            </button>
          </div>
        )}

        <div className="relative flex-1">
          <Cropper
            image={selectedImage}
            crop={crop}
            zoom={zoom}
            aspect={currentAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="h-20 bg-slate-950 border-t border-slate-800 flex items-center justify-between px-6 shrink-0 z-[130]">
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="px-5 py-2.5 text-slate-300 hover:text-white transition-colors font-black uppercase text-xs tracking-widest cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            <Check size={16} /> Confirm Crop
          </button>
        </div>
      </div>
    );
  }

  // 3. Render Offline Deadlock State
  if (!isOnline) {
    return (
      <div className="w-full relative max-w-sm">
        <div className="w-full p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-100 flex flex-col items-center justify-center gap-2 text-slate-400 cursor-not-allowed">
          <WifiOff size={24} className="text-slate-400" />
          <div className="text-center">
            <span className="block text-xs font-black uppercase tracking-widest text-slate-600">Uploads Disabled</span>
            <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
              Media Bucket Requires Active Connection
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 4. Render Active File Picker
  return (
    <div className="w-full relative max-w-sm">
      <input
        type="file"
        accept="image/jpeg, image/png, image/webp"
        onChange={onFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className="w-full p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 hover:border-emerald-500/50 transition-colors flex flex-col items-center justify-center gap-2 text-slate-500">
        <ImageIcon size={24} className="text-slate-400" />
        <div className="text-center">
          <span className="block text-xs font-black uppercase tracking-widest text-slate-700">Tap to Upload Photo</span>
          <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
            JPEG, PNG, WEBP up to 10MB
          </span>
        </div>
      </div>
    </div>
  );
}

export default ImageUploader;