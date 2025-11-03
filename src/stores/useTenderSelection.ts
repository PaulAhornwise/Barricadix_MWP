import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SelectedProduct = {
  id: string;                    // stabile Produkt-ID
  name: string;                  // Anzeigename (nur UI)
  entryId: string;               // Zufahrts-/Kandidaten-ID
  entryLabel: string;            // z.B. Straßenname
  requiredSpeedKmh: number;      // Schutzziel Input
  standards?: string[];          // z.B. ['IWA 14-1', 'ASTM F2656']
  image?: string;                // /images/...
  raw?: any;                     // vollständiges Produktobjekt
};

type State = {
  items: Record<string, SelectedProduct>; // key = entryId or `${entryId}:${productId}`
  add: (p: SelectedProduct) => void;
  remove: (key: string) => void;
  clear: () => void;
  list: () => SelectedProduct[];
};

export const useTenderSelection = create<State>()(
  persist(
    (set, get) => ({
      items: {},
      add: (p) => {
        const key = `${p.entryId}:${p.id}`;
        set(s => ({ items: { ...s.items, [key]: p } }));
        console.info('✅ Pinned to store:', p.entryId, p.id, 'Total items:', Object.keys(get().items).length);
      },
      remove: (k) => {
        set(s => { 
          const n = { ...s.items }; 
          delete n[k]; 
          return { items: n }; 
        });
      },
      clear: () => set({ items: {} }),
      list: () => Object.values(get().items),
    }),
    { name: 'tender-selection-v1' }
  )
);

