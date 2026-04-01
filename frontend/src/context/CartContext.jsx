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
    setItems(stored);
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
    removeItem,
    clearCart,
    totalItems,
    totalQuantity,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
