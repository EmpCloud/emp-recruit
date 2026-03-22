import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import { AppError } from "../../utils/errors";

// Ensure upload directory exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.user?.empcloudOrgId || "unknown";
    const dir = path.join(process.cwd(), "uploads", "resumes", String(orgId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, "INVALID_FILE_TYPE", "Only PDF, DOC, and DOCX files are allowed"));
  }
}

export const uploadResume = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---------------------------------------------------------------------------
// Recording upload (audio/video for interview recordings, up to 500MB)
// ---------------------------------------------------------------------------

const recordingStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const orgId = req.user?.empcloudOrgId || "unknown";
    const dir = path.join(process.cwd(), "uploads", "recordings", String(orgId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

function recordingFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (file.mimetype.startsWith("audio/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new AppError(400, "INVALID_FILE_TYPE", "Only audio and video files are allowed"));
  }
}

export const recordingUpload = multer({
  storage: recordingStorage,
  fileFilter: recordingFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});
