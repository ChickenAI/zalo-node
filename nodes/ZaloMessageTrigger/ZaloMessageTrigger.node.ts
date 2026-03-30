import {
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeConnectionType,
	NodeOperationError,
	IHookFunctions,
} from 'n8n-workflow';
import { API, Zalo, ThreadType } from 'zca-js';
import { getImageMetadata } from '../utils/helper';

let triggerApi: API | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;

export class ZaloMessageTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Message Trigger',
		name: 'zaloMessageTrigger',
		icon: 'file:../shared/zalo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Sự kiện lắng nghe tin nhắn trên Zalo',
		defaults: {
			name: 'Zalo Message Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionType.Main],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
				displayName: 'Zalo Credential to connect with',
			},
		],
		properties: [
			{
				displayName: 'Event Types',
				name: 'eventTypes',
				type: 'multiOptions',
				options: [
					{
						name: 'User Messages',
						value: ThreadType.User,
						description: 'Lắng nghe tin nhắn từ người dùng',
					},
					{
						name: 'Group Messages',
						value: ThreadType.Group,
						description: 'Lắng nghe tin nhắn từ nhóm',
					},
				],
				default: [ThreadType.User, ThreadType.Group],
				required: true,
				description: 'Types of messages to listen for',
			},
			{
				displayName: 'Self Listen',
				name: 'selfListen',
				type: 'boolean',
				default: false,
				required: true,
				description: 'Cho phép lắng nghe tin nhắn của chính mình tự gửi',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				return !!webhookData.isConnected;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('zaloApi');

				if (!credentials) {
					throw new NodeOperationError(this.getNode(), 'No credentials found');
				}

				try {
					const cookieFromCred = JSON.parse(credentials.cookie as string);
					const imeiFromCred = credentials.imei as string;
					const userAgentFromCred = credentials.userAgent as string;

					const selfListen = this.getNodeParameter('selfListen', 0) as boolean;
					const zalo = new Zalo({ selfListen, imageMetadataGetter: getImageMetadata });
					triggerApi = await zalo.login({
						cookie: cookieFromCred,
						imei: imeiFromCred,
						userAgent: userAgentFromCred,
					});

					if (!triggerApi) {
						throw new NodeOperationError(
							this.getNode(),
							'No API instance found. Please make sure to provide valid credentials.',
						);
					}
					const webhookUrl = this.getNodeWebhookUrl('default') as string;
					// Add message event listener
					triggerApi.listener.on('message', async (message) => {
						const webhookData = this.getWorkflowStaticData('node');
						// const eventTypes = webhookData.eventTypes as ThreadType[];
						this.helpers.httpRequest({
							method: 'POST',
							url: webhookUrl,
							body: {
								message: message,
							},
							headers: {
								'Content-Type': 'application/json',
							},
						});
						// if (eventTypes.includes(message.type)) {
						//     console.log(message);
						// Store message in static data to be processed by webhook method
						webhookData.lastMessage = message;
						// }
					});

					// Start listening
					triggerApi.listener.start();

					const webhookData = this.getWorkflowStaticData('node');
					webhookData.isConnected = true;
					webhookData.eventTypes = this.getNodeParameter('eventTypes', 0) as ThreadType[];

					return true;
				} catch (error) {
					throw new NodeOperationError(this.getNode(), 'Zalo connection failed');
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');

				if (triggerApi) {
					triggerApi.listener.stop();
					triggerApi = undefined;
				}

				if (reconnectTimer) {
					clearTimeout(reconnectTimer);
					reconnectTimer = undefined;
				}

				delete webhookData.isConnected;
				delete webhookData.eventTypes;
				delete webhookData.lastMessage;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const webhookData = this.getWorkflowStaticData('node');

		// Clear the message after processing
		delete webhookData.lastMessage;

		return {
			workflowData: [this.helpers.returnJsonArray(req.body)],
		};
	}
}
