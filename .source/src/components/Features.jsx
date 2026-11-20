import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import logo from '../assets/images/logo/syrex-logo.svg';
import './Features.css';

const Features = () => {
    const { t } = useLanguage();

    return (
        <section className="features" id="features">
            <div className="container features-grid">
                <motion.div
                    className="feature-visual"
                    initial={{ opacity: 0, y: 90, rotateY: -12, scale: 0.9 }}
                    whileInView={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="tesseract-wrapper">
                        <div className="feature-grid-bg"></div>
                        <div className="feature-logo-float">
                            <img src={logo} alt="Syrex logo" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    className="feature-text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                >
                    <span className="feature-badge">
                        <svg className="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2l2.7 6.3L21 11l-6.3 2.7L12 20l-2.7-6.3L3 11l6.3-2.7L12 2z" />
                        </svg>
                        {t.features.badge}
                        <svg className="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 2l2.7 6.3L21 11l-6.3 2.7L12 20l-2.7-6.3L3 11l6.3-2.7L12 2z" />
                        </svg>
                    </span>
                    <h2>{t.features.title}<br /><span className="fw-light">{t.features.titleSub}</span></h2>
                    {t.features.desc1 && (
                        <h3>
                            {t.features.desc1} <span className="highlight-num">{t.features.descAmount}</span>
                        </h3>
                    )}
                    {t.features.desc2 && (
                        <p>
                            {t.features.desc2}
                        </p>
                    )}
                    <p className="dimmed">
                        {t.features.desc3}
                    </p>
                </motion.div>
            </div >
        </section >
    );
};

export default Features;

