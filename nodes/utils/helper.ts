import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ImageMetadataGetterResponse } from 'zca-js/dist/context';

/**
 * Image metadata getter for zca-js v2.
 * Uses sharp if available (optional dependency), otherwise returns null.
 */
export async function getImageMetadata(filePath: string): Promise<ImageMetadataGetterResponse> {
	try {
		const sharp = require('sharp');
		const metadata = await sharp(filePath).metadata();
		const stats = fs.statSync(filePath);
		return {
			width: metadata.width || 0,
			height: metadata.height || 0,
			size: stats.size,
		};
	} catch (_error) {
		// sharp not available or error reading image — return null
		return null;
	}
}

/**
 * Tải file bất kỳ (ảnh, pdf, zip...) và lưu vào thư mục tạm trong n8n
 */
export async function saveFile(url: string): Promise<string | null> {
	try {
		const n8nUserFolder = process.env.N8N_USER_FOLDER || path.join(os.homedir(), '.n8n');
		const dataStoragePath = path.join(n8nUserFolder, 'temp_files');

		if (!fs.existsSync(dataStoragePath)) {
			fs.mkdirSync(dataStoragePath, { recursive: true });
		}

		// Lấy phần mở rộng từ URL (nếu có), ví dụ: .png, .pdf
		const urlPath = new URL(url).pathname;
		const ext = path.extname(urlPath) || '.bin';

		const timestamp = Date.now();
		const filePath = path.join(dataStoragePath, `temp-${timestamp}${ext}`);

		const { data } = await axios.get(url, { responseType: 'arraybuffer' });
		fs.writeFileSync(filePath, data); // đúng kiểu nhị phân

		return filePath;
	} catch (error) {
		console.error('Lỗi khi tải/lưu file:', error);
		return null;
	}
}

/**
 * Xoá file đã lưu
 */
export function removeFile(filePath: string): void {
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch (error) {
		console.error('Lỗi khi xoá file:', error);
	}
}
