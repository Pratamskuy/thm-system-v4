import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';

//sebelum ngodong ucapkan bismillah
function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout, isAdmin, isPeminjam } = useAuth();
  const { totalQuantity } = useCart();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const displayName = user?.full_name || user?.name || 'User';
  const email = user?.email || '-';

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 900 && menuOpen) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    logout();
    closeMenu();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="navbar no-print">
      <div className="navbar-content">
        <div className="navbar-title-group">
          <Link to="/dashboard" className="navbar-brand" onClick={closeMenu}>
            THMs
          </Link>
          <button
            className={`navbar-burger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <ul className={`navbar-menu ${menuOpen ? 'open' : ''}`}>
          <li>
            <Link to="/dashboard" className="navbar-link" onClick={closeMenu}>
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/items" className="navbar-link" onClick={closeMenu}>
              Items
            </Link>
          </li>
          {isPeminjam() && (
            <li>
              <Link to="/cart" className="navbar-link" onClick={closeMenu}>
                Cart
                <span className="cart-badge">{totalQuantity}</span>
              </Link>
            </li>
          )}
          <li>
            <Link to="/borrows" className="navbar-link" onClick={closeMenu}>
              Borrows
            </Link>
          </li>
          {isAdmin() && (
            <>
              <li>
                <Link to="/categories" className="navbar-link" onClick={closeMenu}>
                  Categories
                </Link>
              </li>
              <li>
                <Link to="/users" className="navbar-link" onClick={closeMenu}>
                  Users
                </Link>
              </li>
              <li>
                <Link to="/logs" className="navbar-link" onClick={closeMenu}>
                  Logs
                </Link>
              </li>
            </>
          )}
          <li>
            <button onClick={toggleTheme} className="btn btn-sm btn-secondary theme-toggle">
              {theme === 'light' ? '☾' : '☼'}
            </button>
          </li>
          <li>
            <div className="navbar-user-container">
              <div className="account-chip">
                <span className="account-name">{displayName}</span>
                <div className="account-tooltip">
                  <strong>{displayName}</strong>
                  <span>{email}</span>
                  <span>{user?.role_name || 'User'}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="btn btn-sm btn-danger">
                Logout
              </button>
            </div>
          </li>
        </ul>
      </div>
      {menuOpen && <div className="navbar-backdrop" onClick={closeMenu} />}
    </nav>
  );
}

export default Navbar;
