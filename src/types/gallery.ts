export type GalleryPalette = {
  hex: string[];
};

export type GalleryItem = {
  slot: string;
  name: string;
  ankamaId?: number | null;
  imageUrl?: string | null;
};

export type GallerySkin = {
  id: string;
  number: number;
  classId: number;
  className: string;
  classIcon?: string | null;
  gender: string;
  theme: string;
  faceId?: number | null;
  palette: GalleryPalette;
  primaryColor?: string;
  items: GalleryItem[];
};
