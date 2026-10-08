import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRequestSizeLimit, RequestSizeLimitError } from '../request-limits'
import { auditLog } from '../audit'
import { NextRequest } from 'next/server'

// Mock audit log
vi.mock('../audit', () => ({
  auditLog: {
    suspiciousActivity: vi.fn(),
  },
}))

describe('Request Size Limits', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('withRequestSizeLimit', () => {
    it('should allow requests within size limit', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxSize: 1000 })
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': '500' },
        body: 'small body'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })

    it('should reject requests exceeding size limit', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxSize: 1000 })
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': '1500' },
        body: 'large body'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(413)
      
      const body = await response.json()
      expect(body.code).toBe('REQUEST_TOO_LARGE')
      expect(body.error).toContain('Request too large')
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledWith(
        'Request size limit exceeded',
        expect.objectContaining({
          contentLength: 1500,
          maxSize: 1000,
        }),
        request
      )
    })

    it('should allow requests without content-length header', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: 'body without content-length'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle malformed content-length gracefully', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': 'invalid' },
        body: 'body'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })
  })

  describe('File Upload Limits', () => {
    it('should allow files within size limit', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxFileSize: 1000 })
      
      const formData = new FormData()
      const smallFile = new File(['small content'], 'test.csv', { type: 'text/csv' })
      formData.append('file', smallFile)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: formData
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })

    it('should reject files exceeding size limit', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxFileSize: 10 })
      
      const formData = new FormData()
      const largeFile = new File(['this is a large file content'], 'large.csv', { type: 'text/csv' })
      formData.append('file', largeFile)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: formData
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(413)
      
      const body = await response.json()
      expect(body.code).toBe('FILE_TOO_LARGE')
      expect(body.error).toContain('File too large')
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledWith(
        'File size limit exceeded',
        expect.objectContaining({
          fileSize: largeFile.size,
          maxFileSize: 10,
        }),
        request
      )
      // CP-00 R1: filenames may identify patients/studies and must not be logged
      const logged = vi.mocked(auditLog.suspiciousActivity).mock.calls[0][1]
      expect(logged).not.toHaveProperty('fileName')
    })

    it('should check CSV row count for CSV files', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxRows: 5 })
      
      const csvContent = 'col1,col2\nrow1,val1\nrow2,val2\nrow3,val3\nrow4,val4\nrow5,val5\nrow6,val6'
      const formData = new FormData()
      const csvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })
      formData.append('file', csvFile)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: formData
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(413)
      
      const body = await response.json()
      expect(body.code).toBe('TOO_MANY_ROWS')
      expect(body.error).toContain('CSV has too many rows')
    })

    it('should not check row count for non-CSV files', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxRows: 1 })
      
      const formData = new FormData()
      const jsonFile = new File(['{"key": "value"}'], 'data.json', { type: 'application/json' })
      formData.append('file', jsonFile)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: formData
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle malformed CSV files gracefully', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxRows: 1 })
      
      const formData = new FormData()
      const malformedFile = new File(['invalid csv content'], 'bad.csv', { type: 'text/csv' })
      formData.append('file', malformedFile)
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        body: formData
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      // Should still process the file despite malformed content
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })
  })

  describe('RequestSizeLimitError', () => {
    it('should create error with correct properties', () => {
      const error = new RequestSizeLimitError('Test error', 'FILE_TOO_LARGE')
      
      expect(error.message).toBe('Test error')
      expect(error.code).toBe('FILE_TOO_LARGE')
      expect(error.name).toBe('RequestSizeLimitError')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('Security Edge Cases', () => {
    it('should handle extremely large content-length values', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxSize: 1000 })
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': '999999999999999999' },
        body: 'body'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(413)
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledWith(
        'Request size limit exceeded',
        expect.objectContaining({
          contentLength: 999999999999999999,
        }),
        request
      )
    })

    it('should handle negative content-length values', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxSize: 1000 })
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': '-100' },
        body: 'body'
      })
      
      const response = await wrappedHandler(request, { params: Promise.resolve({}) })
      
      // Should treat negative values as invalid and allow request
      expect(mockHandler).toHaveBeenCalled()
      expect(response).toBeInstanceOf(Response)
    })

    it('should log suspicious activity for repeated violations', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withRequestSizeLimit(mockHandler, { maxSize: 100 })
      
      const request = new NextRequest('http://example.com', {
        method: 'POST',
        headers: { 'Content-Length': '200' },
        body: 'large body'
      })
      
      // Make multiple failed requests
      for (let i = 0; i < 3; i++) {
        await wrappedHandler(request, { params: Promise.resolve({}) })
      }
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledTimes(3)
    })
  })
})
