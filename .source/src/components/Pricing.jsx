import React from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, RotateCcw, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { PREMIUM_PLANS, HWID_RESET_OFFER, priceRUB } from '../data/offers';
import './Pricing.css';

const Pricing = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const periodName = (plan) => plan.durationDays === 0
    ? t.pricing.forever
    : plan.durationDays === 30 ? t.pricing.days30
    : plan.durationDays === 90 ? t.pricing.days90
    : t.pricing.days180;

  const buy = (offer) => navigate('/buy?plan=' + encodeURIComponent(offer.kind), { state: { kind: offer.kind } });
  const premiumFeatures = [
    t.pricing.cleanExperience,
    t.pricing.fastSupport,
    t.pricing.earlyUpdates
  ];

  const cardAnimation = (index) => ({
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    whileHover: { y: -4, transition: { duration: 0.2 } },
    transition: { duration: 0.45, delay: index * 0.08 },
    viewport: { once: true }
  });

  return (
    <section className="pricing-section" id="products">
      <div className="pricing-bg-grid" />
      <div className="container">
        <div className="section-header">
          <span className="badge-pill">{t.pricing.badge}</span>
          <h2>{t.pricing.title} <span className="green-text">{t.pricing.titleHighlight}</span></h2>
          <p>{t.pricing.desc}</p>
        </div>

        <div className="pricing-grid pricing-grid-premium">
          {PREMIUM_PLANS.map((plan, index) => (
            <motion.div
              key={plan.kind}
              className={'pricing-card pricing-premium-card' + (plan.durationDays === 90 ? ' recommended' : '')}
              {...cardAnimation(index)}
            >
              {plan.durationDays === 90 && <div className="rec-badge">{t.pricing.bestValue}</div>}
              <div className="card-header">
                <h3><Crown size={19} className="pricing-crown" /> {t.pricing.premium}</h3>
              </div>
              <div className="pricing-plan-duration">{periodName(plan)}</div>
              <div className="card-price"><span className="currency">{priceRUB(plan.priceValue)}</span></div>
              <ul className="features-list">
                {premiumFeatures.map((feature, i) => (
                  <li key={i}><Check size={16} className="check-icon" />{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                className={'btn-select ' + (plan.durationDays === 90 ? 'btn-green' : 'btn-glass')}
                onClick={() => buy(plan)}
              >
                <ShoppingCart size={16} /><span className="btn-gradient-text">{t.pricing.select}</span>
              </button>
            </motion.div>
          ))}
        </div>

        <div className="pricing-extra-title">{t.pricing.additionalServices}</div>
        <motion.div className="pricing-card pricing-hwid-card" {...cardAnimation(4)}>
          <div className="pricing-hwid-main">
            <div className="pricing-hwid-heading">
              <RotateCcw size={20} className="pricing-crown" />
              <div>
                <h3>{t.pricing.hwidReset}</h3>
                <p>{t.pricing.hwidDescription}</p>
              </div>
            </div>
            <div className="pricing-hwid-price">{priceRUB(HWID_RESET_OFFER.priceValue)}</div>
          </div>
          <button type="button" className="btn-select btn-glass pricing-hwid-button" onClick={() => buy(HWID_RESET_OFFER)}>
            <ShoppingCart size={16}/><span className="btn-gradient-text">{t.pricing.select}</span>
          </button>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;
