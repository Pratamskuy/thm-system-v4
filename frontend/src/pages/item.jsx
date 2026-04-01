import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { itemAPI, categoryAPI } from '../services/api';
import { showError, showSuccess, showWarning, showConfirm } from '../services/swalService';

function Items() {
  const { isAdmin, isPeminjam } = useAuth();
  const { addItem, items: cartItems, totalQuantity } = useCart();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [quantityById, setQuantityById] = useState({});
  const [formData, setFormData] = useState({
    item_name: '',
    description: '',
    total: '',
    stock_normal: 1,
    stock_ok: 0,
    stock_not_good: 0,
    stock_broken: 0,
    categories_id: '',
    item_condition: 'normal',
  });

  const isShopMode = isPeminjam();

  const cartLookup = useMemo(() => {
    const map = new Map();
    cartItems.forEach((entry) => {
      map.set(entry.id, entry.quantity);
    });
    return map;
  }, [cartItems]);

  const visibleItems = useMemo(() => {
    let filtered = [...items];

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((item) => {
        const itemCategoryId = String(item.categories_id || item.category_id || '');
        const itemCategoryName = String(item.categories || '').toLowerCase();
        const filterValue = String(categoryFilter).toLowerCase();

        return itemCategoryId === String(categoryFilter) || itemCategoryName === filterValue;
      });
    }

    const keyword = query.trim().toLowerCase();
    if (keyword) {
      filtered = filtered.filter((item) => {
        const haystack = [
          item.item_name,
          item.description,
          item.categories,
          item.item_condition,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
    }

    const conditionOrder = {
      normal: 0,
      ok: 1,
      'not good': 2,
      broken: 3,
    };

    filtered.sort((a, b) => {
      const orderA = conditionOrder[a.item_condition] ?? 0;
      const orderB = conditionOrder[b.item_condition] ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''));
    });

    return filtered;
  }, [items, categoryFilter, query]);

  useEffect(() => {
    loadItems();
    loadCategories();
  }, [isShopMode]);

  const loadItems = async () => {
    try {
      const apiCall = isShopMode ? itemAPI.getAvailable : itemAPI.getAll;
      const res = await apiCall();
      console.log('Items response:', res);
      const data = res.data || res;
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load items:', error);
      showError('Gagal memuat data item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDraftQty = (itemId) => {
    const value = Number(quantityById[itemId]) || 1;
    return value < 1 ? 1 : value;
  };

  const clampQty = (value, maxStock) => {
    let next = Math.max(1, Number(value) || 1);
    if (Number.isFinite(maxStock) && maxStock > 0) {
      next = Math.min(next, maxStock);
    }
    return next;
  };

  const getMaxStock = (item) => {
    const total = Number(item.total) || 0;
    if (total > 0) return total;
    const available = Number(item.available) || 0;
    return available > 0 ? available : 0;
  };

  const updateDraftQty = (itemId, value) => {
    setQuantityById((prev) => ({ ...prev, [itemId]: value }));
  };

  const adjustDraftQty = (item, delta) => {
    const maxStock = getMaxStock(item);
    const current = getDraftQty(item.id);
    const next = clampQty(current + delta, maxStock);
    updateDraftQty(item.id, next);
  };

  const handleAddToCart = (item) => {
    const available = Number(item.available) || 0;
    const maxStock = getMaxStock(item);
    const qty = clampQty(getDraftQty(item.id), maxStock);

    if (maxStock <= 0) {
      showWarning('Item is not available');
      return;
    }

    if (qty > maxStock) {
      showWarning(`Maximum allowed quantity is ${maxStock}`);
      return;
    }

    addItem(
      {
        id: item.id,
        item_name: item.item_name,
        available,
        maxStock,
      },
      qty
    );
    updateDraftQty(item.id, 1);
  };

  const loadCategories = async () => {
    try {
      const res = await categoryAPI.getAll();
      const data = res.data || res;
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.item_name || formData.item_name.trim() === '') {
      showWarning('Nama item wajib diisi!');
      return;
    }
    
    const stock_normal = Number(formData.stock_normal) || 0;
    const stock_ok = Number(formData.stock_ok) || 0;
    const stock_not_good = Number(formData.stock_not_good) || 0;
    const stock_broken = Number(formData.stock_broken) || 0;

    if (stock_normal < 0 || stock_ok < 0 || stock_not_good < 0 || stock_broken < 0) {
      showWarning('Jumlah stok tidak boleh negatif!');
      return;
    }

    const totalStock = stock_normal + stock_ok + stock_not_good + stock_broken;
    const availableStock = stock_normal + stock_ok + stock_not_good;

    if (totalStock <= 0) {
      showWarning('Total item harus lebih dari 0!');
      return;
    }

    try {
      const payload = {
        ...formData,
        total: totalStock,
        available: availableStock,
        stock_normal,
        stock_ok,
        stock_not_good,
        stock_broken,
      };

      console.log('Submitting item data:', payload);
      
      if (editingItem) {
        await itemAPI.update(editingItem.id, payload);
        showSuccess('Item berhasil diupdate!');
      } else {
        await itemAPI.create(payload);
        showSuccess('Item berhasil dibuat!');
      }
      loadItems();
      closeModal();
    } catch (error) {
      console.error('Submit error:', error);
      showError('Gagal menyimpan item: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: 'Hapus Item',
      text: 'Apakah Anda yakin ingin menghapus item ini?',
      confirmButtonText: 'Ya, hapus',
      cancelButtonText: 'Batal',
      icon: 'warning',
    });
    if (!confirmed) return;

    try {
      await itemAPI.delete(id);
      showSuccess('Item berhasil dihapus!');
      loadItems();
    } catch (error) {
      console.error('Delete error:', error);
      showError('Gagal menghapus item: ' + error.message);
    }
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      item_name: '',
      description: '',
      total: '',
      stock_normal: 1,
      stock_ok: 0,
      stock_not_good: 0,
      stock_broken: 0,
      categories_id: '',
      item_condition: 'normal',
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      item_name: item.item_name,
      description: item.description || '',
      total: item.total,
      stock_normal: item.stock_normal ?? 0,
      stock_ok: item.stock_ok ?? 0,
      stock_not_good: item.stock_not_good ?? 0,
      stock_broken: item.stock_broken ?? 0,
      categories_id: item.categories_id || '',
      item_condition: item.item_condition,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  // ADDED: Helper untuk auto-set available saat create
  const handleTotalChange = (value) => {
    setFormData(prev => ({
      ...prev,
      total: value,
      // Jika sedang create (bukan edit), auto set available = total
      available: editingItem ? prev.available : value
    }));
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (isShopMode) {
    return (
      <div>
        <div className="card shop-header">
          <div className="shop-header-content">
            <div>
              <h1 className="card-header">Borrow Items</h1>
              <p className="card-body">Select items and add them to your cart before borrowing.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Cari item..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ minWidth: '160px', width: '100%', maxWidth: '280px' }}
              />
              <select
                className="form-input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ minWidth: '220px', width: '220px' }}
              >
                <option value="all">Semua Kategori</option>
                {(categories.length > 0 ? categories : items)
                  .map((cat) => {
                    const id = String(cat.id || cat.categories_id || cat.category_id || cat.category || '');
                    const name = String(cat.categories || cat.category || '').trim();
                    if (!id || !name) return null;
                    return (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    );
                  })
                  .filter(Boolean)}
              </select>
              <Link to="/cart" className="btn btn-primary">
                Go to Cart ({totalQuantity})
              </Link>
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">[]</div>
              <p>No items are available right now.</p>
            </div>
          </div>
        ) : (
          <div className="shop-grid">
            {visibleItems.map((item) => {
              const available = Number(item.available) || 0;
              const maxStock = getMaxStock(item);
              const cartQty = cartLookup.get(item.id) || 0;
              const conditionBadge =
                item.item_condition === 'normal' ? 'badge-approved' : 'badge-warning';
              const isPreorder = maxStock > 0 && available < getDraftQty(item.id);
              return (
                <div className="card shop-card" key={item.id}>
                  <div className="shop-card-header">
                    <h3 className="text-clamp-1">{item.item_name}</h3>
                    <span className={`badge ${available > 0 ? 'badge-approved' : 'badge-rejected'}`}>
                      {available} available
                    </span>
                  </div>
                  <p className="shop-card-description text-clamp-2">
                    {item.description || 'No description available.'}
                  </p>
                  <div className="shop-card-meta">
                    <span className="shop-meta-label">Condition</span>
                    <span className={`badge ${conditionBadge}`}>{item.item_condition}</span>
                  </div>
                  <div className="shop-card-meta" style={{ gap: '0.35rem' }}>
                    <span className="shop-meta-label">Stok:</span>
                    <span className="badge badge-approved">N: {item.stock_normal || 0}</span>
                    <span className="badge badge-approved">OK: {item.stock_ok || 0}</span>
                    <span className="badge badge-warning">NG: {item.stock_not_good || 0}</span>
                    <span className="badge badge-rejected">BR: {item.stock_broken || 0}</span>
                  </div>
                  <div className="shop-card-actions">
                    <div className="qty-control">
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => adjustDraftQty(item, -1)}
                        disabled={getDraftQty(item.id) <= 1}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        className="form-input shop-qty-input qty-input"
                        min="1"
                        max={maxStock > 0 ? maxStock : undefined}
                        value={getDraftQty(item.id)}
                        onChange={(e) => updateDraftQty(item.id, clampQty(e.target.value, maxStock))}
                      />
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => adjustDraftQty(item, 1)}
                        disabled={maxStock <= 0 || getDraftQty(item.id) >= maxStock}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`btn ${isPreorder ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={maxStock <= 0}
                      onClick={() => handleAddToCart(item)}
                    >
                      {isPreorder ? 'Pre-Order Borrow' : 'Add to Cart'}
                    </button>
                  </div>
                  {isPreorder && (
                    <p className="shop-card-cart">
                      Quantity exceeds available stock. This request will be queued.
                    </p>
                  )}
                  {cartQty > 0 && (
                    <p className="shop-card-cart">
                      In cart: <strong>{cartQty}</strong>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <h1 className="card-header" style={{ margin: 0 }}>
              Manajemen Item
            </h1>
          {isAdmin() && (
            <button className="btn btn-primary" onClick={openCreateModal}>
              + Tambah Item
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Cari item..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: '160px', width: '100%', maxWidth: '280px' }}
          />
            {isAdmin() && (
              <select
                className="form-input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ minWidth: '220px', width: '220px' }}
              >
                <option value="all">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.categories}
                  </option>
                ))}
              </select>
            )}
            
          </div>
        {visibleItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>Belum ada item</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nama Item</th>
                  <th>Deskripsi</th>
                  <th>Kategori</th>
                  <th>Total</th>
                  <th>Tersedia</th>
                  <th>stock by condition</th>
                  <th>Dipinjam</th>
                  <th>Dalam Antrian</th>
                  {isAdmin() && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.item_name}</td>
                    <td>{item.description || '-'}</td>
                    <td>{item.categories || '-'}</td>
                    <td>{item.total}</td>
                    <td>
                      <span className={`badge ${item.available > 0 ? 'badge-approved' : 'badge-rejected'}`}>
                        {item.available}
                      </span>
                    </td>
                    <td>
                      <div className="badge-group" style={{ display: 'grid', gap: '0.25rem' }}>
                        <span className="badge badge-approved">Normal: {item.stock_normal || 0}</span>
                        <span className="badge badge-approved">OK: {item.stock_ok || 0}</span>
                        <span className="badge badge-warning">Not Good: {item.stock_not_good || 0}</span>
                        <span className="badge badge-rejected">Broken: {item.stock_broken || 0}</span>
                      </div>
                    </td>
                    <td>{Number(item.borrowed_approved) || 0}</td>
                    <td>
                      <span className={`badge ${Number(item.requested_not_approved) > 0 ? 'badge-queued' : 'badge-approved'}`}>
                        {Number(item.requested_not_approved) || 0}
                      </span>
                    </td>
                    {isAdmin() && (
                      <td>
                        <div className="btn-group">
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEditModal(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(item.id)}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingItem ? 'Edit Item' : 'Tambah Item Baru'}
              </h2>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nama Item *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.item_name}
                  onChange={(e) => setFormData({...formData, item_name: e.target.value})}
                  required
                  placeholder="Contoh: Canon EOS 700D"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Deskripsi</label>
                <textarea
                  className="form-textarea"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Deskripsi detail item..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select
                  className="form-select"
                  value={formData.categories_id}
                  onChange={(e) => setFormData({...formData, categories_id: e.target.value})}
                >
                  <option value="">Pilih Kategori</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.categories}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Jumlah Total *</label>
                <input
                  type="number"
                  className="form-input"
                  value={
                    Number(formData.stock_normal || 0) +
                    Number(formData.stock_ok || 0) +
                    Number(formData.stock_not_good || 0) +
                    Number(formData.stock_broken || 0)
                  }
                  readOnly
                  placeholder="Jumlah total akan dihitung otomatis"
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Total dihitung dari jumlah kondisi: normal + ok + not good + broken.
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Stok Normal</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock_normal}
                  onChange={(e) => setFormData({ ...formData, stock_normal: Number(e.target.value) })}
                  required
                  min="0"
                  placeholder="Jumlah unit normal"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stok OK</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock_ok}
                  onChange={(e) => setFormData({ ...formData, stock_ok: Number(e.target.value) })}
                  required
                  min="0"
                  placeholder="Jumlah unit OK"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stok Not Good</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock_not_good}
                  onChange={(e) => setFormData({ ...formData, stock_not_good: Number(e.target.value) })}
                  required
                  min="0"
                  placeholder="Jumlah unit not good"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stok Broken</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock_broken}
                  onChange={(e) => setFormData({ ...formData, stock_broken: Number(e.target.value) })}
                  required
                  min="0"
                  placeholder="Jumlah unit broken"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Jumlah Tersedia</label>
                <input
                  type="number"
                  className="form-input"
                  value={
                    Number(formData.stock_normal || 0) +
                    Number(formData.stock_ok || 0) +
                    Number(formData.stock_not_good || 0)
                  }
                  readOnly
                />
                <small style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Jumlah yang bisa dipinjam dihitung dari status normal, ok, dan not good.
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">Kondisi *</label>
                <select
                  className="form-select"
                  value={formData.item_condition}
                  onChange={(e) => setFormData({...formData, item_condition: e.target.value})}
                  required
                >
                  <option value="normal">Normal</option>
                  <option value="ok">OK</option>
                  <option value="not good">Not Good</option>
                  <option value="broken">Broken</option>
                </select>
              </div>

              <div className="btn-group">
                <button type="submit" className="btn btn-primary">
                  {editingItem ? 'Update' : 'Simpan'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Items;
