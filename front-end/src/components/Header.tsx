import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import './Header.css';

interface HeaderProps {
  onNewTaskClick: () => void;
}

const NAV_ITEMS = [
  { to: '/home', label: '畑' },
  { to: '/tasks', label: 'タスク一覧' },
  { to: '/basket', label: '収穫かご' },
];

const Header: React.FC<HeaderProps> = ({ onNewTaskClick }) => {
  const navigate = useNavigate();
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (!isConfirmingLogout) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsConfirmingLogout(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsConfirmingLogout(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isConfirmingLogout]);

  return (
    <header className="app-header">
      <NavLink to="/home" className="app-logo" aria-label="VegeTASK 畑へ">
        VegeTASK
      </NavLink>

      <nav className="app-nav" aria-label="メイン">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to !== '/tasks'}
            className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-header-actions">
        <button type="button" className="btn btn-primary" onClick={onNewTaskClick}>
          ＋ 新規タスク
        </button>

        <div className="logout" ref={popupRef}>
          <button
            type="button"
            className="logout-trigger"
            aria-expanded={isConfirmingLogout}
            onClick={() => setIsConfirmingLogout(!isConfirmingLogout)}
          >
            ログアウト
          </button>

          {isConfirmingLogout && (
            <div className="logout-popover" role="dialog" aria-label="ログアウトの確認">
              <p>ログアウトしますか？</p>
              <div className="logout-popover-actions">
                <button type="button" className="btn btn-quiet" onClick={() => setIsConfirmingLogout(false)}>
                  キャンセル
                </button>
                <button type="button" className="btn btn-danger" onClick={handleLogout}>
                  ログアウト
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
