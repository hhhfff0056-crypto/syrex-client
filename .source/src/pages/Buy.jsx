import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, Sparkles, Cpu, Monitor, HardDrive, ExternalLink } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getOfferByKind, priceRUB } from '../data/offers';
import './Buy.css';

const Buy = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const offer = getOfferByKind(new URLSearchParams(location.search).get('plan') || location.state?.kind || location.state?.product?.kind);
  const isHwid = offer.kind === 'HWID_RESET';
  const duration = offer.durationDays === 0
    ? t.pricing.forever
    : offer.durationDays === 30 ? t.pricing.days30
    : offer.durationDays === 90 ? t.pricing.days90
    : t.pricing.days180;
  const title = isHwid ? t.pricing.hwidReset : t.pricing.premium + ' • ' + duration;

  return (
    <section className="buy-page">
      <div className="buy-glow-top" />
      <div className="container">
        <header className="buy-nav">
          <div className="buy-breadcrumb"><span>Syrex Client</span><span className="sep">•</span><span className="active">{title}</span></div>
        </header>
        <div className="buy-grid minimal">
          <div className="buy-info-side">
            <div className="product-hero-card buy-card">
              <div className="product-visual"><div className="visual-inner">
                <Sparkles className="visual-icon" size={44} />
                <div className="visual-text">SYREX CLIENT</div>
                <div className="visual-glow" />
              </div></div>
              <div className="product-title-section">
                <h1>{title}</h1>
                <p className="product-tagline">{isHwid ? t.buy.hwidNote : t.hero.feat1}</p>
              </div>
            </div>
          </div>
          <aside className="buy-checkout-side">
            <div className="checkout-panel glass-panel buy-card">
              <div className="price-row">
                <div><span className="label-mini">{t.buy.checkoutLabel}</span><div className="brand-name">Syrex Client</div></div>
                <div className="price-display">
                  <span className="price-label">{t.buy.totalLabel}</span>
                  <span className="price-amount">{priceRUB(offer.priceValue)}</span>
                </div>
              </div>

              <div className="premium-note">
                <strong>{isHwid ? t.pricing.hwidReset : t.pricing.premium}:</strong> {isHwid ? t.buy.hwidNote : t.buy.premiumNote}
              </div>

              <div className="payment-grid buy-payment-single">
                <div className="payment-opt active"><ShieldCheck size={18} /><span className="pay-name">FunPay</span></div>
              </div>
              <button className="buy-main-action" type="button" onClick={() => window.open('https://funpay.com/users/17204081/', '_blank', 'noopener,noreferrer')}>
                {t.buy.visitSeller} <ExternalLink size={17} />
              </button>
              <p className="checkout-manual-note">{t.buy.manualNotice}</p>
            </div>
            <div className="reqs-panel glass-panel buy-card">
              <div className="req-row"><Cpu size={14} className="icon-gold" /><div className="req-info"><span className="req-label">{t.buy.reqCpuLabel}</span><span className="req-value">{t.buy.reqCpuValue}</span></div></div>
              <div className="req-row"><Monitor size={14} className="icon-gold" /><div className="req-info"><span className="req-label">{t.buy.reqOsLabel}</span><span className="req-value">{t.buy.reqOsValue}</span></div></div>
              <div className="req-row"><HardDrive size={14} className="icon-gold" /><div className="req-info"><span className="req-label">{t.buy.reqRamLabel}</span><span className="req-value">{t.buy.reqRamValue}</span></div></div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default Buy;
