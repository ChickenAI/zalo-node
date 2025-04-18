import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';
import { API, ThreadType, Zalo } from 'zca-js';
let api: API | undefined;

export class ZaloSendMessage implements INodeType {

	description: INodeTypeDescription = {
		displayName: 'Zalo Send Message (Cookie)',
		name: 'zaloSendMessage',
		icon: 'file:../shared/zalo.svg',
		group: ['Zalo'],
		version: 2,
		description: 'Gửi tin nhắn qua API Zalo sử dụng kết nối đăng nhập bằng cookie',
		defaults: {
			name: 'Zalo Send Message (Cookie)',
		},
		inputs: [NodeConnectionType.Main],
		outputs:[NodeConnectionType.Main],
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
				type: 'number',
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
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
        const inputs = this.getInputData();
		const zaloCred = await this.getCredentials("zaloApi");

        const cookieFromCred = JSON.parse(zaloCred.cookie as string);
        const imeiFromCred = zaloCred.imei as string;
        const userAgentFromCred = zaloCred.userAgent as string;

        const cookie = cookieFromCred ?? inputs.find((x) => x.json.cookie)?.json.cookie as any;
        const imei = imeiFromCred ?? inputs.find((x) => x.json.imei)?.json.imei as string;
        const userAgent = userAgentFromCred ?? inputs.find((x) => x.json.userAgent)?.json.userAgent as string;

        const zalo = new Zalo();
        const _api =  await zalo.login({ cookie, imei, userAgent });
        api = _api;
        if (!api) {
            throw new NodeOperationError(this.getNode(), 'No API instance found. Please make sure to provide valid credentials.')
        }
        this.logger.info(`API ${JSON.stringify(api)}`);

        const threadId = this.getNodeParameter('threadId', 0) as string;
        const type = this.getNodeParameter('type', 0) as ThreadType;
        const message = this.getNodeParameter('message', 0) as string;
        const meta = {threadId, type, message};
        // Gửi tin nhắn một lần
        try {
            this.logger.info(`Parameters before sending message: ${JSON.stringify(meta)}`);

            
            const response = await api.sendMessage({
                msg: message,
                
            },
            
            threadId,
            type);

            this.logger.info('Message sent successfully', {message, threadId, type});
            returnData.push({
                json: response,
            });
        } catch (error) {
            this.logger.error('Error in sendMessage:', { error });
            if ((error as any).response) {
                this.logger.error('Error response:', { response: (error as any).response });
            }
            if ((error as any).stack) {
                this.logger.error('Error stack:', { stack: (error as any).stack });
            }
            throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: 0 });
        }
    
        return [returnData];
	}
}
