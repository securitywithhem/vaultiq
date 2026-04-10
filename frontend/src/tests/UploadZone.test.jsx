/**
 * Tests for frontend/src/components/UploadZone.jsx
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { fileService } from '../services/fileService';

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../services/fileService', () => ({
  fileService: { uploadFile: jest.fn() }
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() }
}));

jest.mock('../utils/format', () => ({
  formatFileSize: (bytes) => `${bytes} B`
}));

// react-dropzone needs a DataTransfer-capable environment; keep the mock simple
jest.mock('react-dropzone', () => ({
  useDropzone: ({ onDrop }) => ({
    getRootProps: () => ({
      onClick: () => {},
      onDrop: (e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length) onDrop(files);
      }
    }),
    getInputProps: () => ({ 'data-testid': 'dropzone-input', type: 'file' }),
    isDragActive: false
  })
}));

import UploadZone from '../components/UploadZone';

// ─── Helper: simulate a file drop ────────────────────────────────────────────
function dropFile(container, file) {
  const zone = container.firstChild;
  fireEvent.drop(zone, {
    dataTransfer: { files: [file] }
  });
}

const makeFile = (name = 'doc.pdf', type = 'application/pdf', size = 1024) => {
  const f = new File(['x'.repeat(size)], name, { type });
  return f;
};

// ─── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => jest.clearAllMocks());

test('renders drop zone prompt', () => {
  render(<UploadZone />);
  expect(screen.getByText(/drop files here or click to browse/i)).toBeInTheDocument();
});

test('shows file name and size after drop', () => {
  const { container } = render(<UploadZone />);
  dropFile(container, makeFile('report.pdf', 'application/pdf', 2048));

  expect(screen.getByText('report.pdf')).toBeInTheDocument();
  expect(screen.getByText(/2048 B/i)).toBeInTheDocument();
});

test('shows Cancel and Secure Upload buttons after file selection', () => {
  const { container } = render(<UploadZone />);
  dropFile(container, makeFile());

  expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /secure upload/i })).toBeInTheDocument();
});

test('Cancel clears the selected file', () => {
  const { container } = render(<UploadZone />);
  dropFile(container, makeFile());

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  expect(screen.getByText(/drop files here or click to browse/i)).toBeInTheDocument();
});

test('calls fileService.uploadFile on Secure Upload click', async () => {
  fileService.uploadFile.mockResolvedValueOnce({ id: 'f1', filename: 'doc.pdf' });
  const onSuccess = jest.fn();
  const { container } = render(<UploadZone onUploadSuccess={onSuccess} />);

  dropFile(container, makeFile());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /secure upload/i }));
  });

  await waitFor(() => {
    expect(fileService.uploadFile).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: 'f1', filename: 'doc.pdf' });
  });
});

test('shows success state after upload', async () => {
  fileService.uploadFile.mockResolvedValueOnce({ id: 'f1', filename: 'doc.pdf' });
  const { container } = render(<UploadZone />);

  dropFile(container, makeFile());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /secure upload/i }));
  });

  await waitFor(() => {
    expect(screen.getByText(/encrypted & uploaded/i)).toBeInTheDocument();
  });
});

test('shows toast error when upload fails', async () => {
  const toast = require('react-hot-toast').default;
  fileService.uploadFile.mockRejectedValueOnce({ response: { data: { error: 'File too large' } } });
  const { container } = render(<UploadZone />);

  dropFile(container, makeFile());
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /secure upload/i }));
  });

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith('File too large');
  });
});
