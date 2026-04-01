import React from 'react';
import PropTypes from 'prop-types';
import styles from './LoadingSpinner.module.css';

const LoadingSpinner = ({ text, size = 'md' }) => {
  return (
    <div className={styles.container}>
      <div className={`${styles.spinner} ${styles[size]}`}></div>
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
};

LoadingSpinner.propTypes = {
  text: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg'])
};

export default LoadingSpinner;
