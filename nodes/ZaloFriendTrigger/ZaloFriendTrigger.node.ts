import {
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeConnectionType,
	NodeOperationError,
	IHookFunctions,
} from 'n8n-workflow';
import { API, Zalo, FriendEventType, FriendEvent } from 'zca-js';
import { getImageMetadata } from '../utils/helper';

let triggerApi: API | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;

export class ZaloFriendTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Friend Trigger',
		name: 'zaloFriendTrigger',
		icon: 'file:../shared/zalo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Lắng nghe sự kiện kết bạn trên Zalo',
		defaults: {
			name: 'Zalo Friend Trigger',
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
						name: 'Friend Requests',
						value: FriendEventType.REQUEST,
						description: 'Nghe sự kiện yêu cầu kết bạn',
					},
				],
				default: [FriendEventType.REQUEST],
				required: true,
				description: 'Friend events to listen for',
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

					const zalo = new Zalo({ imageMetadataGetter: getImageMetadata });
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
					triggerApi.listener.on('friend_event', async (event: FriendEvent) => {
						const nodeEventTypes = this.getNodeParameter('eventTypes', 0) as FriendEventType[];
						if (nodeEventTypes.includes(event.type)) {
							this.helpers.httpRequest({
								method: 'POST',
								url: webhookUrl,
								body: {
									friendEvent: event.data,
								},
								headers: {
									'Content-Type': 'application/json',
								},
							});
						}
					});

					// Start listening
					triggerApi.listener.start();

					const webhookData = this.getWorkflowStaticData('node');
					webhookData.isConnected = true;
					webhookData.eventTypes = this.getNodeParameter('eventTypes', 0) as FriendEventType[];

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
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();

		return {
			workflowData: [this.helpers.returnJsonArray(req.body)],
		};
	}
}
