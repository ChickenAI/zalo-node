import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError
} from 'n8n-workflow';
import { API, ThreadType, Zalo } from 'zca-js';
import { saveFile, removeFile } from '../utils/helper';

let api: API | undefined;

export class ZaloSendMessage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Send Message',
		name: 'zaloSendMessage',
		icon: 'file:../shared/zalo.svg',
		group: ['Zalo'],
		version: 5,
		description: 'Gửi tin nhắn qua API Zalo sử dụng kết nối đăng nhập bằng cookie',
		defaults: {
			name: 'Zalo Send Message',
		},
		// @ts-ignore
		inputs: ['main'],
		// @ts-ignore
		outputs: ['main'],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Thread ID',
				name: 'threadId',
				type: 'string',
				default: '',
				required: true,
				description: 'ID của thread để gửi tin nhắn',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'User',
						value: 0,
					},
					{
						name: 'Group',
						value: 1,
					},
				],
				default: 0,
				description: 'Loại của tin nhắn (user hoặc group)',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				required: true,
				description: 'Nội dung tin nhắn cần gửi',
			},
			{
				displayName: 'Urgency',
				name: 'urgency',
				type: 'options',
				options: [
					{
						name: 'Default',
						value: 0,
					},
					{
						name: 'Important',
						value: 1,
					},
					{
						name: 'Urgent',
						value: 2,
					},
				],
				default: 0,
				description: 'Mức độ khẩn cấp của tin nhắn',
			},
			{
				displayName: 'Quote Message',
				name: 'quote',
				type: 'collection',
				placeholder: 'Add Quote',
				default: {},
				options: [
					{
						displayName: 'Message ID',
						name: 'msgId',
						type: 'string',
						default: '',
						description: 'ID của tin nhắn cần trích dẫn',
					},
					{
						displayName: 'Sender ID',
						name: 'senderId',
						type: 'string',
						default: '',
						description: 'ID của người gửi tin nhắn trích dẫn',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						default: '',
						description: 'Nội dung tin nhắn trích dẫn',
					},
				],
			},
			{
				displayName: 'Mentions',
				name: 'mentions',
				type: 'collection',
				placeholder: 'Add Mention',
				default: {},
				options: [
					{
						displayName: 'User ID',
						name: 'uid',
						type: 'string',
						default: '',
						description: 'ID của người dùng được mention',
					},
					{
						displayName: 'Position',
						name: 'pos',
						type: 'number',
						default: 0,
						description: 'Vị trí mention trong tin nhắn',
					},
					{
						displayName: 'Length',
						name: 'len',
						type: 'number',
						default: 0,
						description: 'Độ dài của mention',
					},
				],
			},
			{
				displayName: 'Attachments',
				name: 'attachments',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Attachment',
				default: {},
				options: [
					{
						name: 'attachment',
						displayName: 'Attachment',
						values: [
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{
										name: 'Image URL/File URL',
										value: 'url',
									},
									{
										name: 'Array of URLs',
										value: 'urlArray',
									}
								],
								default: 'url',
								description: 'Loại file đính kèm',
							},
							{
								displayName: 'Image URL/File URL',
								name: 'imageUrl',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										'type': ['url'],
									},
								},
								description: 'URL công khai của ảnh hoặc file',
							},
							{
								displayName: 'Image URLs Array',
								name: 'imageUrls',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										'type': ['urlArray'],
									},
								},
								description: 'Array of URLs (JSON format) hoặc comma-separated URLs. VD: ["url1","url2"] hoặc url1,url2.',
							}
						],
					},
				],
				description: 'Một hoặc nhiều ảnh đính kèm để gửi',
			},
		],
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const items = this.getInputData();
		const zaloCred = await this.getCredentials('zaloApi');

		// Parse credentials
		const cookieFromCred = JSON.parse(zaloCred.cookie as string);
		const imeiFromCred = zaloCred.imei as string;
		const userAgentFromCred = zaloCred.userAgent as string;

		// Initialize Zalo API
		try {
			const zalo = new Zalo();
			api = await zalo.login({ 
				cookie: cookieFromCred,
				imei: imeiFromCred, 
				userAgent: userAgentFromCred 
			});
			
			if (!api) {
				throw new NodeOperationError(this.getNode(), 'Failed to initialize Zalo API. Check your credentials.');
			}
		} catch (error) {
			throw new NodeOperationError(this.getNode(), `Zalo login error: ${(error as Error).message}`);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				// Get parameters
				const threadId = this.getNodeParameter('threadId', i) as string;
				const typeNumber = this.getNodeParameter('type', i) as number;
				const type = typeNumber === 0 ? ThreadType.User : ThreadType.Group;
				const message = this.getNodeParameter('message', i) as string;
				const urgency = this.getNodeParameter('urgency', i, 0) as number;
				const quote = this.getNodeParameter('quote', i, {}) as any;
				const mentions = this.getNodeParameter('mentions', i, {}) as any;
				const attachments = this.getNodeParameter('attachments', i, {}) as any;

				// Create message content
				const messageContent: any = {
					msg: message,
				};

				// Add urgency if specified
				if (urgency !== 0) {
					messageContent.urgency = urgency;
				}

				// Add quote if specified
				if (quote && Object.keys(quote).length > 0) {
					messageContent.quote = {
						msgId: quote.msgId,
						senderId: quote.senderId,
						content: quote.content,
					};
				}

				// Add mentions if specified
				if (mentions && Object.keys(mentions).length > 0) {
					messageContent.mentions = [{
						pos: mentions.pos || 0,
						uid: mentions.uid,
						len: mentions.len || 0,
					}];
				}

				// Add attachments if specified
				if (attachments && attachments.attachment && attachments.attachment.length > 0) {
					messageContent.attachments = [];
					for (const attachment of attachments.attachment) {
						if (attachment.type === 'url') {
							// Handle single URL or comma-separated URLs
							let urls: string[] = [];
							
							if (typeof attachment.imageUrl === 'string') {
								// Check if it contains commas (multiple URLs)
								if (attachment.imageUrl.includes(',')) {
									urls = attachment.imageUrl.split(',').map((url: string) => url.trim()).filter((url: string) => url);
								} else {
									urls = [attachment.imageUrl.trim()];
								}
							}
							
							// Process each URL
							for (const url of urls) {
								if (url) {
									this.logger.info(`Processing URL: ${url}`);
									const fileData = await saveFile(url);
									if (fileData) {
										messageContent.attachments.push(fileData);
										this.logger.info(`Successfully downloaded: ${fileData}`);
									} else {
										this.logger.error(`Failed to download file from URL: ${url}`);
									}
								}
							}
						} else if (attachment.type === 'urlArray') {
							// Array of URLs
							let urls: string[] = [];
							
							// Parse URLs from string input
							if (typeof attachment.imageUrls === 'string') {
								try {
									// Try to parse as JSON array first
									urls = JSON.parse(attachment.imageUrls);
								} catch {
									// If not JSON, try comma-separated
									urls = attachment.imageUrls.split(',').map((url: string) => url.trim()).filter((url: string) => url);
								}
							}
							
							// Process each URL
							for (const url of urls) {
								if (url) {
									this.logger.info(`Processing URL: ${url}`);
									const fileData = await saveFile(url);
									if (fileData) {
										messageContent.attachments.push(fileData);
										this.logger.info(`Successfully downloaded: ${fileData}`);
									} else {
										this.logger.error(`Failed to download file from URL: ${url}`);
									}
								}
							}
						}
					}
				}

				// Log the parameters before sending
				this.logger.info(`Sending message with parameters: ${JSON.stringify(messageContent)}`);
				// Send the message
				if (!api) {
					throw new NodeOperationError(this.getNode(), 'Zalo API not initialized');
				}

				//Send typing event
				try {
					const recipentObj = {
						id : threadId,
						type: type
					}
					const result = await api.sendTypingEvent(recipentObj.id, recipentObj.type);
					if (!!result) {
						this.logger.info("Send! typing event")
					}
				}
				catch (e) {
					this.logger.error("Cannot send typing event")
				}
				
				// Send message
				const response = await api.sendMessage(messageContent, threadId, type);

				//Remove temp img
				if (messageContent.attachments && messageContent.attachments.length > 0){
					for (const attachment of messageContent.attachments) {
						this.logger.info(`Remove attachment: ${attachment}`);

						removeFile(attachment)
					}
				}
				this.logger.info('Message sent successfully', { threadId, type });


				returnData.push({
					json: {
						success: true,
						response,
						threadId,
						threadType: type,
						messageContent,
					},
				});
				
			} catch (error) {
				this.logger.error('Error sending Zalo message:', error);
				
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							success: false,
							error: (error as Error).message,
						},
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}
		}

		return [returnData];
	}
}
