import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { itemAPI, borrowAPI, userAPI } from '../services/api';

function Dashboard() {
  const { user, isAdmin, isPetugas, isAdminOrPetugas } = useAuth();
  const [stats, setStats] = useState({
    totalItems: 0,
    availableItems: 0,
    queuedBorrows: 0,
    activeBorrows: 0,
    myBorrows: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentBorrows, setRecentBorrows] = useState([]);
  const [myBorrows, setMyBorrows] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(null);
  const dragDeltaX = useRef(0);

  const slides = [
    {
      badge: 'NEW ITEM',
      title: 'ARRI ALEXA 35',
      text: 'ARRI ALEXA 35 dengan production kit lengkap, siap untuk produksi film Anda berikutnya. Hubungi admin untuk info peminjaman.',
      image: 'sld(arri-alexa).jpg',
    },
    {
      badge: 'HOT ITEM',
      title: 'SONY A7V',
      text: 'SONY A7V mirrorless kamera dengan performa tinggi, ideal untuk fotografi dan videografi. Tersedia untuk dipinjam, segera hubungi admin!',
      image: 'sld(sony a7v).jpg',
    },
  ];

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [slides.length]);

  const nextSlide = () => {
    setActiveSlide((current) => (current + 1) % slides.length);
  };

  const prevSlide = () => {
    setActiveSlide((current) => (current - 1 + slides.length) % slides.length);
  };

  const handlePointerDown = (event) => {
    dragStartX.current = event.clientX;
    dragDeltaX.current = 0;
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!isDragging || dragStartX.current === null) return;
    dragDeltaX.current = event.clientX - dragStartX.current;
  };

  const handlePointerEnd = () => {
    if (!isDragging) return;
    if (dragDeltaX.current > 80) {
      prevSlide();
    } else if (dragDeltaX.current < -80) {
      nextSlide();
    }
    dragStartX.current = null;
    dragDeltaX.current = 0;
    setIsDragging(false);
  };

  const loadDashboardData = async () => {
    try {
      const [itemsRes, availableRes] = await Promise.all([
        itemAPI.getAll(),
        itemAPI.getAvailable(),
      ]);

      let borrowData = { data: [] };
      let myBorrowsData = { data: [] };
      let usersData = { data: [] };

      if (isAdminOrPetugas()) {
        const [pendingRes, activeRes, allBorrowsRes] = await Promise.all([
          borrowAPI.getPending(),
          borrowAPI.getActive(),
          borrowAPI.getAll(),
        ]);
        
        borrowData = allBorrowsRes;
        const queuedCount = borrowData.data?.filter((b) => b.status === 'queued').length || 0;

        setStats(prev => ({
          ...prev,
          pendingBorrows: pendingRes.data?.length || 0,
          queuedBorrows: queuedCount,
          activeBorrows: activeRes.data?.length || 0,
        }));
        
        setRecentBorrows(borrowData.data?.slice(0, 5) || []);
      } else {
        myBorrowsData = await borrowAPI.getMy();
        setRecentBorrows(myBorrowsData.data?.slice(0, 5) || []);
        setMyBorrows(myBorrowsData.data || []);
      }

      if (isAdmin()) {
        usersData = await userAPI.getAll();
      }

      setStats(prev => ({
        ...prev,
        totalItems: itemsRes.data?.length || 0,
        availableItems: availableRes.data?.length || 0,
        myBorrows: myBorrowsData.data?.length || 0,
        totalUsers: usersData.data?.length || 0,
      }));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    const confirmed = await showConfirm({
      title: 'Approve Request',
      text: 'Are you sure you want to approve this borrow request?',
      confirmButtonText: 'Yes, approve',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) return;
    
    try {
      await borrowAPI.approve(id);
      showSuccess('Borrow request approved successfully!');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to approve borrow:', error);
      showError('Failed to approve borrow request');
    }
  };

  const handleReject = async (id) => {
    const notes = await showPrompt({
      title: 'Reject Request',
      text: 'Enter rejection reason (optional):',
      inputLabel: 'Rejection reason',
      inputPlaceholder: 'Type a reason (optional)',
    });
    if (notes === null) return;
    try {
      await borrowAPI.reject(id, notes);
      showSuccess('Borrow request rejected successfully!');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to reject borrow:', error);
      showError('Failed to reject borrow request');
    }
  };

  const handleCancel = async (id) => {
    const confirmed = await showConfirm({
      title: 'Cancel Request',
      text: 'Are you sure you want to cancel this borrow request?',
      confirmButtonText: 'Yes, cancel',
      cancelButtonText: 'Keep',
      icon: 'question',
    });
    if (!confirmed) return;
    
    try {
      await borrowAPI.cancel(id);
      showSuccess('Borrow request cancelled successfully!');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to cancel borrow:', error);
      showError('Failed to cancel borrow request');
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="card dashboard-welcome-card">
        <h1>Welcome,{user?.full_name || user?.name || 'User'}!. You're logged in as "{user?.role_name || 'User'}".</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {user?.role_name || 'User'} Dashboard
        </p>
      </div>

      <div className="banner-slider">
        <div
          className={`banner-slide ${isDragging ? 'dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="banner-slide-copy">
            <span className="banner-badge">{slides[activeSlide].badge}</span>
            <h2>{slides[activeSlide].title}</h2>
            <p>{slides[activeSlide].text}</p>
            <div className="banner-slider-controls">
              {slides.map((_, index) => (
                <button
                  key={index}
                  className={`slider-dot ${index === activeSlide ? 'active' : ''}`}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                />
              ))}
            </div>
          </div>
          <div className="banner-slide-preview">
            <div className="banner-slide-image">
              <img
                src={`/banner/${slides[activeSlide].image}`}
                alt={slides[activeSlide].title}
                className="banner-preview-img"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>{stats.totalItems}</h3>
          <p>Total Items</p>
        </div>
        
        <div className="stat-card">
          <h3>{stats.availableItems}</h3>
          <p>Available Items</p>
        </div>

        {isAdminOrPetugas() && (
          <>
            <div className="stat-card">
              <h3>{stats.queuedBorrows}</h3>
              <p>Queued Borrows</p>
            </div>
            
            <div className="stat-card">
              <h3>{stats.activeBorrows}</h3>
              <p>Active Borrows</p>
            </div>
          </>
        )}

        {!isAdminOrPetugas() && (
          <div className="stat-card">
            <h3>{stats.myBorrows}</h3>
            <p>My Borrows</p>
          </div>
        )}

        {isAdmin() && (
          <div className="stat-card">
            <h3>{stats.totalUsers}</h3>
            <p>Total Users</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          {isAdminOrPetugas() ? 'Recent Borrow Requests' : 'My Recent Borrows'}
        </div>
        
        {recentBorrows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>No borrow records yet</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  {isAdminOrPetugas() && <th>Borrower</th>}
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentBorrows.map((borrow) => (
                  <tr key={borrow.id}>
                    <td>#{borrow.id}</td>
                    {isAdminOrPetugas() && <td>{borrow.nama_peminjam}</td>}
                    <td>{borrow.item_name}</td>
                    <td>{borrow.item_count}</td>
                    <td>{new Date(borrow.return_date_expected).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge badge-${borrow.status}`}>
                        {borrow.status}
                      </span>
                    </td>
                    <td>
                      {isAdminOrPetugas() && borrow.status === 'pending' && (
                        <div className="action-buttons">
                          <button 
                            className="btn btn-success btn-sm" 
                            onClick={() => handleApprove(borrow.id)}
                          >
                            Approve
                          </button>
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => handleReject(borrow.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {isAdminOrPetugas() && borrow.status === 'queued' && (
                        <div className="action-buttons">
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => handleReject(borrow.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {!isAdminOrPetugas() && (borrow.status === 'pending' || borrow.status === 'queued') && (
                        <button 
                          className="btn btn-warning btn-sm" 
                          onClick={() => handleCancel(borrow.id)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* rencananya line ini mau saya kasih embed tiktok/yt buat hiburan admin */}
    </div>
  );
}

export default Dashboard;
