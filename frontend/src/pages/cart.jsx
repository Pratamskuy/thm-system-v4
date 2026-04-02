import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { borrowAPI, itemAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { showSuccess, showError, showWarning } from '../services/swalService';

const MAX_ITEMS_PER_REQUEST = 20;
const INITIAL_FORM_STATE = {
  return_date_expected: '',
  request_notes: '',
};

function Cart() {
  const { isPeminjam } = useAuth();
  const { items, updateQuantity, updateCondition, removeItem, clearCart, totalItems, totalQuantity } = useCart();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const res = await itemAPI.getAll();
      setInventoryItems(res.data || []);
    } catch (error) {
      console.error('Failed to load item inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const inventoryMap = useMemo(() => {
    const map = new Map();
    inventoryItems.forEach((item) => {
      map.set(item.id, {
        available: Number(item.available) || 0,
        total: Number(item.total) || 0,
        stock_normal: Number(item.stock_normal) || 0,
        stock_ok: Number(item.stock_ok) || 0,
        stock_not_good: Number(item.stock_not_good) || 0,
        stock_broken: Number(item.stock_broken) || 0,
      });
    });
    return map;
  }, [inventoryItems]);

  const cartRows = useMemo(
    () =>
      items.map((entry) => {
        const inventory = inventoryMap.get(entry.id);
        return {
          ...entry,
          available: inventory ? inventory.available : 0,
          total: inventory ? inventory.total : 0,
        };
      }),
    [items, inventoryMap]
  );

  const normalizeCondition = (value) => {
    const condition = String(value || 'normal').toLowerCase();
    if (['normal', 'ok', 'not good'].includes(condition)) return condition;
    return 'normal';
  };

  const getConditionStock = (entry) => {
    const inventory = inventoryMap.get(entry.id);
    const condition = normalizeCondition(entry.condition);
    if (!inventory) return 0;

    if (condition === 'ok') return inventory.stock_ok;
    if (condition === 'not good') return inventory.stock_not_good;
    return inventory.stock_normal;
  };

  const getMaxStock = (entry) => {
    const total = Number(entry.total) || 0;
    if (total > 0) return total;
    const available = Number(entry.available) || 0;
    return available > 0 ? available : 0;
  };

  const hasInvalidQty = cartRows.some((entry) => {
    const maxStock = getMaxStock(entry);
    return maxStock <= 0 || entry.quantity > maxStock;
  });
  const hasPreorder = cartRows.some(
    (entry) => (Number(entry.available) || 0) < (Number(entry.quantity) || 0)
  );
  const exceedsMaxItems = cartRows.length > MAX_ITEMS_PER_REQUEST;

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clampQty = (value, maxStock) => {
    let next = Math.max(1, Number(value) || 1);
    if (Number.isFinite(maxStock) && maxStock > 0) {
      next = Math.min(next, maxStock);
    }
    return next;
  };

  const handleQuantityChange = (entry, value) => {
    const nextQty = clampQty(value, getMaxStock(entry));
    updateQuantity(entry.id, nextQty);
  };

  const adjustQuantity = (entry, delta) => {
    const nextQty = clampQty(entry.quantity + delta, getMaxStock(entry));
    updateQuantity(entry.id, nextQty);
  };

  const generateIdempotencyKey = () => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `borrow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const handleSubmit = async () => {
    if (cartRows.length === 0) {
      showWarning('Cart is empty');
      return;
    }

    if (!form.return_date_expected) {
      showWarning('Expected return date is required');
      return;
    }

    if (exceedsMaxItems) {
      showWarning(`Maximum ${MAX_ITEMS_PER_REQUEST} items per request`);
      return;
    }

    if (hasInvalidQty) {
      showWarning('Some items exceed the maximum allowed quantity or are unavailable.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        request_notes: form.request_notes || null,
        items: cartRows.map((entry) => ({
          id_items: entry.id,
          item_count: Number(entry.quantity) || 1,
          item_condition: normalizeCondition(entry.condition),
          return_date_expected: form.return_date_expected,
          notes: null,
        })),
      };

      const idempotencyKey = generateIdempotencyKey();
      const response = await borrowAPI.createBatch(payload, idempotencyKey);

      clearCart();
      setForm(INITIAL_FORM_STATE);

      const requestId = response?.data?.request_id;
      showSuccess(
        response?.message ||
          `Borrow request submitted successfully${requestId ? ` (Request #${requestId})` : ''}!`
      );
    } catch (error) {
      showError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isPeminjam()) {
    return (
      <div className="card">
        <h1 className="card-header">Cart</h1>
        <p className="card-body">Cart is only available for borrowers.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <div className="card cart-header">
        <div className="cart-header-content">
          <div>
            <h1 className="card-header">Borrow Cart</h1>
            <p className="card-body">
              {totalItems} item{totalItems !== 1 ? 's' : ''} in cart, total quantity {totalQuantity}.
            </p>
          </div>
          <Link to="/items" className="btn btn-secondary">
            Continue Browsing
          </Link>
        </div>
      </div>

      {cartRows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">[]</div>
            <p>Your cart is empty.</p>
            <Link to="/items" className="btn btn-primary mt-2">
              Browse Items
            </Link>
          </div>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="card cart-items">
            <h2 className="card-header">Items in Cart</h2>
            <div className="cart-list">
              {cartRows.map((entry) => {
                const maxStock = getMaxStock(entry);
                const outOfStock = entry.available <= 0;
                const exceedsStock = entry.quantity > entry.available;
                const isUnavailable = maxStock <= 0;
                const selectedCondition = normalizeCondition(entry.condition);
                const selectedConditionStock = getConditionStock(entry);
                const inventoryItem = inventoryMap.get(entry.id) || {};
                return (
                  <div className="cart-item" key={entry.id}>
                    <div className="cart-item-info">
                      <h3 className="text-clamp-1">{entry.item_name}</h3>
                      <p className="cart-item-meta">
                        Available: {entry.available}
                        {Number.isFinite(Number(entry.total)) && entry.total > 0 && (
                          <span> / Total: {entry.total}</span>
                        )}
                        {isUnavailable && (
                          <span className="cart-item-warning"> Item unavailable</span>
                        )}
                        {!isUnavailable && outOfStock && (
                          <span className="cart-item-warning"> Out of stock (queued)</span>
                        )}
                        {!isUnavailable && !outOfStock && exceedsStock && (
                          <span className="cart-item-warning"> Quantity exceeds stock (queued)</span>
                        )}
                      </p>
                      <div className="form-group" style={{ marginTop: '0.75rem' }}>
                        <label className="form-label" htmlFor={`condition-${entry.id}`}>
                          Item Condition
                        </label>
                        <select
                          id={`condition-${entry.id}`}
                          className="form-input"
                          value={selectedCondition}
                          onChange={(e) => updateCondition(entry.id, e.target.value)}
                        >
                          <option value="normal">Normal ({inventoryItem.stock_normal || 0})</option>
                          <option value="ok">OK ({inventoryItem.stock_ok || 0})</option>
                          <option value="not good">Not Good ({inventoryItem.stock_not_good || 0})</option>
                        </select>
                        {!isUnavailable && selectedConditionStock < entry.quantity && (
                          <p className="cart-item-warning" style={{ marginTop: '0.5rem' }}>
                            Kondisi {selectedCondition} tidak cukup untuk jumlah ini. Item akan antre jika disimpan.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="cart-item-actions">
                      <div className="qty-control">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => adjustQuantity(entry, -1)}
                          disabled={entry.quantity <= 1}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          className="form-input cart-qty-input qty-input"
                          value={entry.quantity}
                          min="1"
                          max={maxStock > 0 ? maxStock : undefined}
                          onChange={(e) => handleQuantityChange(entry, e.target.value)}
                        />
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => adjustQuantity(entry, 1)}
                          disabled={isUnavailable || (maxStock > 0 && entry.quantity >= maxStock)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeItem(entry.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card cart-summary">
            <h2 className="card-header">Borrow Summary</h2>
            <div className="cart-summary-row">
              <span>Total items</span>
              <strong>{totalItems}</strong>
            </div>
            <div className="cart-summary-row">
              <span>Total quantity</span>
              <strong>{totalQuantity}</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Expected Return Date *</label>
              <input
                type="date"
                className="form-input"
                value={form.return_date_expected}
                onChange={(e) => updateForm('return_date_expected', e.target.value)}
                min={today}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={form.request_notes}
                onChange={(e) => updateForm('request_notes', e.target.value)}
                placeholder="Optional notes for this borrow request..."
              />
            </div>
            {exceedsMaxItems && (
              <div className="alert alert-warning">
                Maximum {MAX_ITEMS_PER_REQUEST} items per request.
              </div>
            )}
            {hasInvalidQty && (
              <div className="alert alert-warning">
                Some items exceed the maximum allowed quantity or are unavailable.
              </div>
            )}
            {!hasInvalidQty && hasPreorder && (
              <div className="alert alert-info">
                Some items will be queued as pre-order because stock is not enough.
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isSubmitting || hasInvalidQty || exceedsMaxItems}
            >
              {isSubmitting
                ? 'Submitting...'
                : hasPreorder
                ? 'Submit Pre-Order Request'
                : 'Submit Borrow Request'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearCart} disabled={isSubmitting}>
              Clear Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;