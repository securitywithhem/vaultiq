import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

test('renders app and contexts', () => {
  render(
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
  
  const bodyElement = document.querySelector('body');
  expect(bodyElement).toBeInTheDocument();
});
