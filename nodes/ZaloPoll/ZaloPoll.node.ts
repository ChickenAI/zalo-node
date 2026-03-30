import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
} from 'n8n-workflow';
import { zaloPollOperations, zaloPollFields } from './ZaloPollDescription';
import { Zalo } from 'zca-js';
import { getImageMetadata } from '../utils/helper';

export class ZaloPoll implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Poll',
		name: 'zaloPoll',
		icon: 'file:../shared/zalo.svg',
		group: ['Zalo'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Quản bình chọn Zalo',
		defaults: {
			name: 'Zalo Poll',
		},
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
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Poll',
						value: 'zaloPoll',
					},
				],
				default: 'zaloPoll',
			},
			...zaloPollOperations,
			...zaloPollFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const zaloCred = await this.getCredentials('zaloApi');

		const cookieFromCred = JSON.parse(zaloCred.cookie as string);
		const imeiFromCred = zaloCred.imei as string;
		const userAgentFromCred = zaloCred.userAgent as string;

		const cookie = cookieFromCred ?? (items.find((x) => x.json.cookie)?.json.cookie as any);
		const imei = imeiFromCred ?? (items.find((x) => x.json.imei)?.json.imei as string);
		const userAgent =
			userAgentFromCred ?? (items.find((x) => x.json.userAgent)?.json.userAgent as string);

		const zalo = new Zalo({ imageMetadataGetter: getImageMetadata });
		const api = await zalo.login({ cookie, imei, userAgent });

		if (!api) {
			throw new NodeOperationError(
				this.getNode(),
				'No API instance found. Please make sure to provide valid credentials.',
			);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'zaloPoll') {
					//Tạo bình chọn
					if (operation === 'createPoll') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const question = this.getNodeParameter('question', i) as string;

						const optionInputType = this.getNodeParameter('optionInputType', i, 'list') as string;

						let options: string[] = [];

						if (optionInputType === 'list') {
							try {
								const pollOptionsCollection = this.getNodeParameter('pollOptionsCollection', i, {
									options: [],
								}) as {
									options?: Array<{
										option: string;
									}>;
								};

								if (
									pollOptionsCollection?.options &&
									Array.isArray(pollOptionsCollection.options)
								) {
									options = pollOptionsCollection.options
										.map((item) => (item?.option || '').trim())
										.filter((option) => option !== '');
								}
							} catch (error) {
								throw new NodeOperationError(
									this.getNode(),
									'Lỗi xử lý các lựa chọn: ' + (error.message || 'Lỗi không xác định'),
								);
							}
						} else if (optionInputType === 'text') {
							const optionsString = this.getNodeParameter('optionsString', i, '') as string;
							if (optionsString && optionsString.trim() !== '') {
								options = optionsString
									.split(',')
									.map((option) => option.trim())
									.filter((option) => option !== '');
							}
						}

						// Kiểm tra xem có ít nhất một lựa chọn hay không
						if (!options || options.length === 0) {
							throw new NodeOperationError(
								this.getNode(),
								'Vui lòng nhập ít nhất một lựa chọn cho bình chọn',
								{ itemIndex: i },
							);
						}

						const expiredTime =
							this.getNodeParameter('expiredTime', i, null) !== null
								? new Date(this.getNodeParameter('expiredTime', i) as string).getTime() || 0
								: 0;
						const pinAct = this.getNodeParameter('pinAct', i, false) as boolean;
						const allowMultiChoices = this.getNodeParameter(
							'allowMultiChoices',
							i,
							true,
						) as boolean;
						const allowAddNewOption = this.getNodeParameter(
							'allowAddNewOption',
							i,
							true,
						) as boolean;
						const hideVotePreview = this.getNodeParameter('hideVotePreview', i, false) as boolean;
						const isAnonymous = this.getNodeParameter('isAnonymous', i, false) as boolean;

						// Create message content
						const createPollData: any = {
							question: question,
							options: options,
							expiredTime: expiredTime,
							pinAct: pinAct,
							allowMultiChoices: allowMultiChoices,
							allowAddNewOption: allowAddNewOption,
							hideVotePreview: hideVotePreview,
							isAnonymous: isAnonymous,
						};

						// Log the parameters before sending
						this.logger.info(`Create poll with parameters: ${JSON.stringify(createPollData)}`);

						// Send create poll
						if (!api) {
							throw new NodeOperationError(this.getNode(), 'Zalo API not initialized', {
								itemIndex: i,
							});
						}

						const response = await api.createPoll(createPollData, groupId);

						this.logger.info('Create poll successfully', { groupId, question });

						returnData.push({
							json: {
								success: true,
								response,
								groupId,
								createPollData,
							},
						});
					}
					//Lấy thông tin bình chọn
					else if (operation === 'getPoll') {
						const poll_id = Number(this.getNodeParameter('poll_id', i));
						// Log the parameters before sending
						this.logger.info(`Get poll with parameters: ${JSON.stringify(poll_id)}`);

						// Send create poll
						if (!api) {
							throw new NodeOperationError(this.getNode(), 'Zalo API not initialized', {
								itemIndex: i,
							});
						}

						const response = await api.getPollDetail(poll_id);

						this.logger.info('Get poll successfully', { response });

						returnData.push({
							json: {
								success: true,
								response,
								poll_id,
							},
						});
					}
					//Khóa bình chọn
					else if (operation === 'lockPoll') {
						const poll_id = Number(this.getNodeParameter('poll_id', i));

						// Log the parameters before sending
						this.logger.info(`Lock poll with parameters: ${JSON.stringify(poll_id)}`);

						// Send create poll
						if (!api) {
							throw new NodeOperationError(this.getNode(), 'Zalo API not initialized', {
								itemIndex: i,
							});
						}

						const response = await api.lockPoll(poll_id);

						this.logger.info('Lock poll successfully', { response });

						returnData.push({
							json: {
								success: true,
								response,
								poll_id,
							},
						});
					}
				}
			} catch (error) {
				this.logger.info(`Error create poll: ${JSON.stringify(error)}`);
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
