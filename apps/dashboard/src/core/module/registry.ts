import { create } from 'zustand';
import type { IModule, ModuleMeta } from './types';

interface ModuleRegistryState {
  modules: Map<string, IModule>;
  register: (module: IModule) => void;
  unregister: (id: string) => boolean;
  get: (id: string) => IModule | undefined;
  getAll: () => IModule[];
  getAllMeta: () => ModuleMeta[];
}

export const useModuleRegistry = create<ModuleRegistryState>((set, get) => ({
  modules: new Map(),

  register: (module) => {
    set((state) => {
      const newModules = new Map(state.modules);
      if (newModules.has(module.meta.id)) {
        console.warn(`Module already registered: ${module.meta.id}`);
        return state;
      }
      newModules.set(module.meta.id, module);
      return { modules: newModules };
    });
  },

  unregister: (id) => {
    const module = get().modules.get(id);
    if (!module) return false;

    module.cleanup?.();
    set((state) => {
      const newModules = new Map(state.modules);
      newModules.delete(id);
      return { modules: newModules };
    });
    return true;
  },

  get: (id) => get().modules.get(id),

  getAll: () =>
    Array.from(get().modules.values()).sort((a, b) => (a.meta.order ?? 99) - (b.meta.order ?? 99)),

  getAllMeta: () =>
    get()
      .getAll()
      .map((m) => m.meta),
}));
