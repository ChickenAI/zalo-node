import {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	INodeExecutionData,
	NodeConnectionType,
	NodeApiError,
} from 'n8n-workflow';
import { API, Zalo } from 'zca-js';
import { getImageMetadata } from '../utils/helper';

export class ZaloTag implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Tag',
		name: 'zaloTag',
		group: ['transform'],
		version: 1,
		description: 'Quản lý thẻ (tag) trong Zalo',
		defaults: {
			name: 'Zalo Tag',
		},
		icon: 'file:../shared/zalo.svg',
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'zaloApi',
				required: true,
				displayName: 'Zalo Credential to connect with',
			},
		],
		properties: [
			{
				displayName: 'Hành đỘng',
				name: 'action',
				type: 'options',
				options: [
					{
						name: 'Danh Sách Thẻ',
						value: 'list',
						description: 'Liệt kê tất cả các thẻ',
						action: 'List',
					},
				],
				default: 'list',
				description: 'Hành động cần thực hiện',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const action = this.getNodeParameter('action', 0) as string;

		const zaloCred = await this.getCredentials('zaloApi');
		const cookieFromCred = JSON.parse(zaloCred.cookie as string);
		const imeiFromCred = zaloCred.imei as string;
		const userAgentFromCred = zaloCred.userAgent as string;

		let api: API;
		try {
			const zalo = new Zalo({ imageMetadataGetter: getImageMetadata });
			api = await zalo.login({
				cookie: cookieFromCred,
				imei: imeiFromCred,
				userAgent: userAgentFromCred,
			});

			if (!api) {
				throw new NodeApiError(this.getNode(), {
					message: 'Không thể khởi tạo API Zalo. Vui lòng kiểm tra thông tin đăng nhập.',
				});
			}
		} catch (error) {
			throw new NodeApiError(this.getNode(), error, {
				message: `Lỗi đăng nhập Zalo: ${(error as Error).message}`,
			});
		}

		for (let i = 0; i < items.length; i++) {
			if (action === 'list') {
				const response = await api.getLabels();
				returnData.push({ json: { success: true, labels: response } });
			}
		}

		return [returnData];
	}
}
