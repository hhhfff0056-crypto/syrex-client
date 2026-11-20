import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';
import previewOne from '../assets/images/d1.png';
import previewTwo from '../assets/images/d2.png';
import previewThree from '../assets/images/d3.jpg';
import './Showcase.css';

const Showcase = () => {
  const { t } = useLanguage();

  return (
    <section className="showcase" id="inside-client">
      <div className="container showcase-container">
        <div className="showcase-head">
          <span className="showcase-badge">
            <svg className="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.7 6.3L21 11l-6.3 2.7L12 20l-2.7-6.3L3 11l6.3-2.7L12 2z" />
            </svg>
            {t.showcase.badge}
            <svg className="badge-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l2.7 6.3L21 11l-6.3 2.7L12 20l-2.7-6.3L3 11l6.3-2.7L12 2z" />
            </svg>
          </span>
          <h2>
            {t.showcase.title} <span className="green-text">{t.showcase.highlight}</span>
          </h2>
          <p>{t.showcase.subtitle}</p>
        </div>
        <div className="showcase-grid">
          <motion.div className="showcase-card dim-side" initial={{opacity:0,y:100,rotateY:-16,scale:.86}} whileInView={{opacity:1,y:0,rotateY:0,scale:1}} viewport={{once:true,amount:.2}} transition={{duration:.95,ease:[.22,1,.36,1]}}> 
            <img src={previewOne} alt="Client preview 1" className="showcase-image" />
          </motion.div>
          <motion.div className="showcase-card" initial={{opacity:0,y:120,scale:.82}} whileInView={{opacity:1,y:0,scale:1}} viewport={{once:true,amount:.2}} transition={{duration:1.05,delay:.12,ease:[.22,1,.36,1]}}> 
            <img src={previewTwo} alt="Client preview 2" className="showcase-image" />
          </motion.div>
          <motion.div className="showcase-card dim-side" initial={{opacity:0,y:100,rotateY:16,scale:.86}} whileInView={{opacity:1,y:0,rotateY:0,scale:1}} viewport={{once:true,amount:.2}} transition={{duration:.95,delay:.2,ease:[.22,1,.36,1]}}>
            <img src={previewThree} alt="Client preview 3" className="showcase-image" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Showcase;
