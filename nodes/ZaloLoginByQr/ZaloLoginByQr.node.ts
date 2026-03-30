import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';
import { Zalo, type LoginQRCallbackEvent } from 'zca-js';
import axios from 'axios';

export class ZaloLoginByQr implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Login Via QR Code',
		name: 'zaloLoginByQr',
		group: ['Zalo'],
		version: 2,
		description: 'Đăng nhập Zalo bằng QR code và lưu thông tin vào Credential',
		defaults: {
			name: 'Zalo Login Via QR Code',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		icon: 'file:../shared/zalo.svg',
		credentials: [
			{
				name: 'zaloApi',
				required: false,
				displayName: 'Zalo Credential to connect with',
			},
			{
				name: 'n8nZaloApi',
				required: true,
				displayName: 'n8n Account Credential',
			},
		],
		properties: [
			{
				displayName: 'Proxy',
				name: 'proxy',
				type: 'string',
				default: '',
				placeholder: 'https://user:pass@host:port',
				description: 'HTTP proxy to use for Zalo API requests',
			},
			{
				displayName: 'QR Code File Path',
				name: 'qrPath',
				type: 'string',
				default: '/tmp/zalo-qr.png',
				description:
					'Path where the QR code image will also be saved to disk (backup). The QR code is returned as binary output.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const proxy = this.getNodeParameter('proxy', 0, '') as string;
		const qrPath = this.getNodeParameter('qrPath', 0, '/tmp/zalo-qr.png') as string;

		// Get n8n API credential (required for saving new Zalo credentials)
		let n8nCredential: any;
		try {
			n8nCredential = await this.getCredentials('n8nZaloApi');
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				'n8n API credential is required to save Zalo login credentials.',
			);
		}

		// Get existing Zalo credential if provided (for re-login scenarios)
		let zaloCredential: any;
		try {
			zaloCredential = await this.getCredentials('zaloApi');
		} catch (_error) {
			// No Zalo credential selected — fresh QR login
		}

		try {
			const zaloOptions: any = { selfListen: true, logging: true };
			if (proxy) zaloOptions.proxy = proxy;
			const zalo = new Zalo(zaloOptions);

			// If we have existing Zalo credentials, try to login with them directly
			if (zaloCredential?.cookie && zaloCredential?.imei && zaloCredential?.userAgent) {
				this.logger.info('Attempting login with existing Zalo credentials...');
				try {
					const cookieFromCred = JSON.parse(zaloCredential.cookie as string);
					const api = await zalo.login({
						cookie: cookieFromCred,
						imei: zaloCredential.imei as string,
						userAgent: zaloCredential.userAgent as string,
					});
					if (api) {
						returnData.push({
							json: {
								success: true,
								message: 'Logged in successfully using existing Zalo credentials.',
								loginMethod: 'cookie',
							},
						});
						return [returnData];
					}
				} catch (loginError) {
					this.logger.warn(
						`Existing credentials login failed: ${(loginError as Error).message}. Falling back to QR login.`,
					);
				}
			}

			// ── QR Code login flow ────────────────────────────────────────────────────
			// The key insight: loginQR() blocks until the user scans AND confirms.
			// n8n can only show output AFTER execute() returns — so the user would never
			// see the QR code to scan it, causing the node to block forever.
			//
			// Fix: use a "fire and forget" approach:
			//   1. Start loginQR() in the background (do NOT await it here)
			//   2. Wait only until the QR image is generated (a few HTTP calls, ~1-2s)
			//   3. Return the QR code immediately so the user can see and scan it
			//   4. Background promise: when login completes, save credentials via n8n API
			// ─────────────────────────────────────────────────────────────────────────

			this.logger.info('Starting Zalo QR login process...');

			// Resolved as soon as QRCodeGenerated fires (before user scans)
			let qrReadyResolve!: (image: string) => void;
			let qrReadyReject!: (err: Error) => void;
			const qrReadyPromise = new Promise<string>((resolve, reject) => {
				qrReadyResolve = resolve;
				qrReadyReject = reject;
			});

			// Capture credential values now for use in background closure
			const n8nApiUrl = (n8nCredential.url as string) || 'http://localhost:5678';
			const n8nApiKey = n8nCredential.apiKey as string;
			const capturedProxy = proxy;

			// loginInfo is populated by the GotLoginInfo callback event
			let loginInfo: { cookie: any[]; imei: string; userAgent: string } | undefined;

			// Start QR login — intentionally NOT awaited
			const loginQRPromise = zalo.loginQR({ qrPath }, (qrEvent: LoginQRCallbackEvent) => {
				switch (qrEvent.type) {
					case 0: // QRCodeGenerated — resolve qrReadyPromise immediately
						qrReadyResolve(qrEvent.data.image);
						break;

					case 1: // QRCodeExpired — do NOT retry; abort so background process ends
						console.warn('[ZaloLoginByQr] QR code expired. Re-run the node to get a new QR code.');
						qrEvent.actions.abort();
						break;

					case 2: // QRCodeScanned
						console.info(
							`[ZaloLoginByQr] QR code scanned by: ${(qrEvent.data as any)?.display_name ?? 'unknown'}`,
						);
						break;

					case 3: // QRCodeDeclined
						console.warn('[ZaloLoginByQr] QR code declined by user on phone.');
						qrEvent.actions.abort();
						break;

					case 4: // GotLoginInfo — capture credentials
						if (qrEvent.data) {
							loginInfo = {
								cookie: qrEvent.data.cookie || [],
								imei: qrEvent.data.imei || '',
								userAgent: qrEvent.data.userAgent || '',
							};
							console.info('[ZaloLoginByQr] Login credentials received from Zalo.');
						}
						break;

					default:
						console.warn(`[ZaloLoginByQr] Unknown QR event type: ${(qrEvent as any).type}`);
				}
			});

			// If loginQR fails before the QR is ever generated, propagate to qrReadyPromise
			loginQRPromise.catch((err: Error) => {
				try {
					qrReadyReject(err);
				} catch (_) {
					// qrReadyPromise was already resolved — this is fine
				}
			});

			// Background: once login completes, save credentials via n8n API
			loginQRPromise
				.then(async () => {
					if (!loginInfo || (!loginInfo.cookie.length && !loginInfo.imei)) {
						console.error(
							'[ZaloLoginByQr] Login succeeded but no credentials were captured — NOT saved.',
						);
						return;
					}
					try {
						const response = await axios.post(
							`${n8nApiUrl}/api/v1/credentials`,
							{
								name: 'Zalo API Credentials',
								type: 'zaloApi',
								data: {
									cookie: JSON.stringify(loginInfo.cookie),
									imei: loginInfo.imei,
									userAgent: loginInfo.userAgent,
									proxy: capturedProxy || '',
								},
							},
							{
								headers: {
									'Content-Type': 'application/json',
									'X-N8N-API-KEY': n8nApiKey,
								},
							},
						);
						console.info(
							`[ZaloLoginByQr] Credentials saved successfully. Credential ID: ${response.data?.id ?? 'unknown'}`,
						);
					} catch (err: any) {
						console.error(`[ZaloLoginByQr] Failed to save credentials via n8n API: ${err.message}`);
					}
				})
				.catch((err: Error) => {
					if ((err as any).name !== 'ZaloApiLoginQRAborted') {
						console.error(`[ZaloLoginByQr] QR login failed in background: ${err.message}`);
					}
				});

			// Wait only until the QR image is ready (typically 1-3 seconds)
			const qrImage = await qrReadyPromise;

			this.logger.info(
				`QR code generated and saved to: ${qrPath}. Scan it with your Zalo app. Credentials will be saved automatically after you confirm login on your phone.`,
			);

			// Return QR code immediately as binary output so the user can see and scan it
			const binaryData = Buffer.from(qrImage, 'base64');
			returnData.push({
				json: {
					success: true,
					message:
						'QR code generated. Scan the image below with your Zalo app. Credentials will be saved automatically once you confirm login on your phone.',
					qrPath,
					loginMethod: 'qr',
				},
				binary: {
					data: await this.helpers.prepareBinaryData(binaryData, 'zalo-qr-code.png', 'image/png'),
				},
			});

			return [returnData];
		} catch (error: any) {
			if (this.continueOnFail()) {
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray({ error: error.message }),
					{ itemData: { item: 0 } },
				);
				return [executionData];
			} else {
				throw new NodeOperationError(this.getNode(), error);
			}
		}
	}
}
