import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const safeParse = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getDefaultCartCondition = (item) => {
  const normal = Number(item?.stock_normal) || 0;
  const ok = Number(item?.stock_ok) || 0;
  const notGood = Number(item?.stock_not_good) || 0;
  if (normal > 0) return 'normal';
  if (ok > 0) return 'ok';
  if (notGood > 0) return 'not good';
  return 'normal';
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const storageKey = useMemo(() => {
    if (user?.id) return `borrow_cart_${user.id}`;
    return 'borrow_cart_guest';
  }, [user?.id]);

  const [items, setItems] = useState([]);

  useEffect(() => {
    const stored = safeParse(localStorage.getItem(storageKey));
    const normalized = stored.map((entry) => ({
      ...entry,
      condition: entry.condition || 'normal',
    }));
    setItems(normalized);
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const addItem = (item, quantity = 1) => {
    const normalizedQty = Math.max(1, Number(quantity) || 1);
    const rawMaxStock = Number(item.maxStock);
    const maxStock = Number.isFinite(rawMaxStock) && rawMaxStock > 0
      ? rawMaxStock
      : Number.isFinite(Number(item.available)) && Number(item.available) > 0
      ? Number(item.available)
      : null;
    const defaultCondition = item.condition || getDefaultCartCondition(item);

    setItems((prev) => {
      const existing = prev.find((entry) => entry.id === item.id);
      if (existing) {
        const nextQty = existing.quantity + normalizedQty;
        const finalQty = maxStock ? Math.min(nextQty, maxStock) : nextQty;
        return prev.map((entry) =>
          entry.id === item.id ? { ...entry, quantity: finalQty } : entry
        );
      }

      const finalQty = maxStock ? Math.min(normalizedQty, maxStock) : normalizedQty;
      return [
        ...prev,
        {
          id: item.id,
          item_name: item.item_name,
          quantity: finalQty,
          condition: defaultCondition,
        },
      ];
    });
  };

  const updateQuantity = (id, quantity) => {
    const normalizedQty = Math.max(1, Number(quantity) || 1);
    setItems((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, quantity: normalizedQty } : entry))
    );
  };

  const updateCondition = (id, condition) => {
    const normalized = String(condition || 'normal').toLowerCase();
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, condition: ['normal', 'ok', 'not good'].includes(normalized) ? normalized : 'normal' }
          : entry
      )
    );
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((entry) => entry.id !== id));
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalQuantity = useMemo(
    () => items.reduce((acc, entry) => acc + (Number(entry.quantity) || 0), 0),
    [items]
  );

  const totalItems = items.length;

  const value = {
    items,
    addItem,
    updateQuantity,
    updateCondition,
    removeItem,
    clearCart,
    totalItems,
    totalQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
