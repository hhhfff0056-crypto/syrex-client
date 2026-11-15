import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, AnimatePresence } from 'framer-motion';
import { ChevronDown, Globe, Moon, Sun, Sparkles, ShoppingBag, PlayCircle, Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { getAuthItem, clearAuth } from '../utils/authStorage';
import logo from '../assets/images/logo/syrex-logo.png';
import './Navbar.css';

const Navbar = () => {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const navRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const languages = ['English', 'Russian', 'Polish'];

  useEffect(() => scrollY.on('change', (latest) => setIsScrolled(latest > 50)), [scrollY]);

  useEffect(() => {
    setIsAuthed(!!getAuthItem('authUser'));
    setIsMenuOpen(false);
    setIsLangOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!navRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
        setIsLangOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setIsLangOpen(false);
      }
    };
    const onResize = () => {
      if (window.innerWidth > 1200) setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const signOut = () => {
    clearAuth();
    setIsAuthed(false);
    setIsMenuOpen(false);
    navigate('/');
  };

  const navItems = [
    { to: '/', label: t.nav.home, icon: <span className="icon-grid">⌘</span> },
    { to: '/#features', label: t.nav.features, icon: <Sparkles size={15} /> },
    { to: '/products', label: t.nav.programs, icon: <ShoppingBag size={15} /> },
    {
      to: '/#inside-client',
      label: t.nav.support,
      icon: (
        <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      ),
    },
    { to: '/#creators', label: t.nav.faq, icon: <PlayCircle size={15} /> },
  ];

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/' && (!location.hash || location.hash === '#top');
    if (to === '/products') return location.pathname === '/products';
    return location.pathname === '/' && location.hash === to.slice(1);
  };

  const authControl = (mobile = false) => {
    const className = mobile ? 'nav-mobile-auth' : 'login-link';
    if (!isAuthed) {
      return <Link to="/login" className={className} onClick={() => setIsMenuOpen(false)}>{t.nav.login}</Link>;
    }
    if (location.pathname === '/profile') {
      return <button type="button" className={className} onClick={signOut}>Sign out</button>;
    }
    return <Link to="/profile" className={className} onClick={() => setIsMenuOpen(false)}>Profile</Link>;
  };

  return (
    <motion.nav
      ref={navRef}
      className={'navbar' + (isScrolled ? ' scrolled' : '')}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      aria-label="Site navigation"
    >
      <div className="nav-capsule">
        <Link to="/" className="logo-section" aria-label="Syrex, home" onClick={() => setIsMenuOpen(false)}>
          <span className="logo-badge"><img src={logo} alt="" className="logo-image" /></span>
          <span className="logo-text">Syrex</span>
        </Link>

        <div className="nav-links" aria-label="Main links">
          {navItems.map(({ to, label, icon }) => (
            <Link key={to} to={to} className={'nav-item' + (isActive(to) ? ' active' : '')}>
              {icon}<span>{label}</span>
            </Link>
          ))}
        </div>

        <div className="auth-action">{authControl()}</div>

        <div className="nav-right-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          </button>

          <div className="lang-container">
            <button
              className={'lang-capsule' + (isLangOpen ? ' active' : '')}
              type="button"
              aria-expanded={isLangOpen}
              aria-haspopup="listbox"
              aria-label={'Language: ' + language}
              onClick={() => setIsLangOpen((open) => !open)}
            >
              <Globe size={17} />
              <span className="lang-label">{language}</span>
              <ChevronDown size={13} className="lang-arrow" />
            </button>
            <AnimatePresence>
              {isLangOpen && (
                <motion.div
                  className="lang-dropdown"
                  role="listbox"
                  aria-label="Choose language"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                >
                  {languages.map((lang) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={language === lang}
                      key={lang}
                      className={'lang-option' + (language === lang ? ' selected' : '')}
                      onClick={() => { setLanguage(lang); setIsLangOpen(false); }}
                    >
                      {lang}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            className="nav-menu-toggle"
            type="button"
            aria-controls="nav-mobile-panel"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => { setIsMenuOpen((open) => !open); setIsLangOpen(false); }}
          >
            {isMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            id="nav-mobile-panel"
            className="nav-mobile-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <div className="nav-mobile-links">
              {navItems.map(({ to, label, icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={'nav-mobile-item' + (isActive(to) ? ' active' : '')}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {icon}<span>{label}</span>
                </Link>
              ))}
            </div>
            <div className="nav-mobile-footer">{authControl(true)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
