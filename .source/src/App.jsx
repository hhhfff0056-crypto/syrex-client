import React, { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import Showcase from './components/Showcase';
import Pricing from './components/Pricing';
import Faq from './components/Faq';
import CreatorVideos from './components/CreatorVideos';
import Footer from './components/Footer';
import Login from './pages/Login';
import Register from './pages/Register';
import SupabaseProfile from './pages/SupabaseProfile';
import Keys from './pages/Keys';
import Cosmetics from './pages/Cosmetics';
import Tickets from './pages/Tickets';
import Buy from './pages/Buy';
import Products from './pages/Products';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AdminUsers from './pages/AdminUsers';
import { useLanguage } from './context/LanguageContext';
import { api } from './api';
import { getAuthItem, setAuthItemAuto } from './utils/authStorage';
import { getCurrentUser } from './auth/supabaseAuth';
import { pingSitePresence } from './services/licenseApi';

function VerifiedAdminRoute() {
  const navigate = useNavigate();
  const [access, setAccess] = React.useState('checking');
  React.useEffect(() => {
    let active = true;
    getCurrentUser().then((user) => {
      if (!active) return;
      const role = String(user?.app_metadata?.role || '').toUpperCase();
      if (user && ['ADMIN', 'DEV', 'DEVELOPER'].includes(role)) {
        setAccess('granted');
      } else {
        setAccess('denied');
      }
    }).catch(() => {
      if (active) setAccess('denied');
    });
    return () => { active = false; };
  }, []);
  React.useEffect(() => {
    if (access === 'denied') navigate('/profile', { replace: true });
  }, [access, navigate]);
  if (access === 'checking') return <main role="status" style={{ padding: '8rem 2rem', textAlign: 'center' }}>Проверяем права доступа...</main>;
  if (access !== 'granted') return null;
  return <AdminUsers />;
}


const Home = () => (
  <main>
    <Hero />
    <Features />
    <Showcase />
    <CreatorVideos />
    <Faq />
  </main>
);

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible' || !getAuthItem('authToken')) return;
      pingSitePresence().catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 60000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);
  const hideFooter = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/profile' || location.pathname === '/admin' || location.pathname === '/keys' || location.pathname === '/cosmetics' || location.pathname === '/profile/tikets' || location.pathname === '/buy' || location.pathname === '/admin';
  const { isFading } = useLanguage();


  useEffect(() => {
    const userId = getAuthItem('userId');
    if (!userId || getAuthItem('authProvider') === 'supabase') return;
    api.profile(userId)
      .then((res) => {
        const role = res.user?.role;
        if (role) {
          setAuthItemAuto('authUser', role);
        }
        if (role === 'BANNED') {
          const allowed = ['/profile/tikets', '/login', '/register'];
          if (!allowed.includes(location.pathname)) {
            navigate('/profile/tikets');
          }
        }
      })
      .catch(() => {});
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          const rect = el.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          let target = top;
          if (id === 'features') {
            const centerOffset = window.innerHeight / 2 - rect.height / 2;
            target = top - centerOffset - 40;
          }
          if (id === 'creators') {
            target = top - 120;
          }
          window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }, 0);
      }
      return;
    }
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
  }, [location.pathname, location.hash]);

  return (
    <motion.div
      className="app"
      animate={{ opacity: isFading ? 0 : 1 }}
      transition={{ duration: 0.22 }}
    >
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<SupabaseProfile />} />
        <Route path="/keys" element={<Keys />} />
        <Route path="/cosmetics" element={<Cosmetics />} />
        <Route path="/profile/tikets" element={<Tickets />} />
        <Route path="/buy" element={<Buy />} />
        <Route path="/products" element={<Products />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/policy" element={<Privacy />} />
        <Route path="/admin" element={<VerifiedAdminRoute />} />
      </Routes>
      {!hideFooter && <Footer />}
    </motion.div>
  );
}

export default App;
