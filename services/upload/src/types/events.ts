import { EventType } from '@bookspace/common';

/**
 * File Upload Event
 */
export interface FileUploadedEvent {
  type: EventType.FILE_UPLOADED;
  timestamp: string;
  data: {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    s3Key: string;
    uploadedBy: string;
    isImage: boolean;
  };
}

// Extend EventType enum
declare module '@bookspace/common' {
  enum EventType {
    FILE_UPLOADED = 'file.uploaded',
  }
}
