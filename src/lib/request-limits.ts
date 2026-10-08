import { NextRequest, NextResponse } from 'next/server'
import { auditLog } from '@/lib/audit'

// Configuration constants
const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB for file uploads
const MAX_CSV_ROWS = 500 // Free tier limit

export interface RequestSizeLimitOptions {
  maxSize?: number
  maxFileSize?: number
  maxRows?: number
}

export class RequestSizeLimitError extends Error {
  constructor(
    message: string,
    public readonly code: 'REQUEST_TOO_LARGE' | 'FILE_TOO_LARGE' | 'TOO_MANY_ROWS'
  ) {
    super(message)
    this.name = 'RequestSizeLimitError'
  }
}

/**
 * Middleware to enforce request size limits for Next.js routes
 */
export function withRequestSizeLimit<T extends Record<string, unknown>>(
  handler: (req: NextRequest, context: { params: Promise<T> }) => Promise<NextResponse>,
  options: RequestSizeLimitOptions = {}
) {
  return async (req: NextRequest, context: { params: Promise<T> }): Promise<NextResponse> => {
    const {
      maxSize = MAX_REQUEST_SIZE,
      maxFileSize = MAX_FILE_SIZE,
      maxRows = MAX_CSV_ROWS,
    } = options

    try {
      // Check overall request size
      const contentLength = req.headers.get('content-length')
      if (contentLength) {
        const size = parseInt(contentLength, 10)
        if (size > maxSize) {
          await auditLog.suspiciousActivity(
            'Request size limit exceeded',
            { 
              contentLength: size,
              maxSize,
              userAgent: req.headers.get('user-agent'),
              ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            },
            req
          )
          
          throw new RequestSizeLimitError(
            `Request too large. Maximum size is ${formatBytes(maxSize)}`,
            'REQUEST_TOO_LARGE'
          )
        }
      }

      // For file uploads, check multipart content
      const contentType = req.headers.get('content-type')
      if (contentType?.includes('multipart/form-data')) {
        const formData = await req.formData()
        
        // Check file size
        const file = formData.get('file') as File
        if (file && file.size > maxFileSize) {
          await auditLog.suspiciousActivity(
            'File size limit exceeded',
            { 
              fileSize: file.size,
              maxFileSize,
              userAgent: req.headers.get('user-agent'),
              ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            },
            req
          )
          
          throw new RequestSizeLimitError(
            `File too large. Maximum size is ${formatBytes(maxFileSize)}`,
            'FILE_TOO_LARGE'
          )
        }

        // For CSV files, check row count
        if (file && file.type === 'text/csv') {
          try {
            const text = await file.text()
            const rows = text.split('\n').filter(row => row.trim()).length
            
            if (rows > maxRows) {
              await auditLog.suspiciousActivity(
                'CSV row limit exceeded',
                { 
                  rowCount: rows,
                  maxRows,
                  userAgent: req.headers.get('user-agent'),
                  ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                },
                req
              )
              
              throw new RequestSizeLimitError(
                `CSV has too many rows. Maximum is ${maxRows} rows`,
                'TOO_MANY_ROWS'
              )
            }
            
            // If CSV passes validation, proceed to handler
            return await handler(req, context)
          } catch (error) {
            // If it's our RequestSizeLimitError, re-throw it
            if (error instanceof RequestSizeLimitError) {
              throw error
            }
            // If we can't parse the file, let the main handler deal with it
            console.warn('Could not parse CSV for row count check:', error)
          }
        }

        // Create a new request with the form data for the handler
        const newReq = new NextRequest(req.url, {
          method: req.method,
          headers: req.headers,
          body: formData,
        })

        return await handler(newReq, context)
      }

      return await handler(req, context)
    } catch (error) {
      if (error instanceof RequestSizeLimitError) {
        return NextResponse.json(
          { 
            error: error.message,
            code: error.code,
            details: {
              maxSize: formatBytes(maxSize),
              maxFileSize: formatBytes(maxFileSize),
              maxRows,
            }
          },
          { status: 413 }
        )
      }

      // Re-throw other errors
      throw error
    }
  }
}

/**
 * Specific middleware for file upload routes
 */
export function withFileUploadLimit<T extends Record<string, unknown>>(
  handler: (req: NextRequest, context: { params: Promise<T> }) => Promise<NextResponse>,
  options: Pick<RequestSizeLimitOptions, 'maxFileSize' | 'maxRows'> = {}
) {
  return withRequestSizeLimit(handler, {
    maxSize: MAX_FILE_SIZE + 1024, // Allow some overhead for multipart data
    ...options,
  })
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
