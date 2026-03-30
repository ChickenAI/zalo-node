import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
	NodeOperationError,
	IDataObject,
} from 'n8n-workflow';
import { zaloGroupOperations, zaloGroupFields } from './ZaloGroupDescription';
import { Zalo } from 'zca-js';
import { getImageMetadata } from '../utils/helper';

export class ZaloGroup implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo Group',
		name: 'zaloGroup',
		icon: 'file:../shared/zalo.svg',
		group: ['Zalo'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Quản lý nhóm Zalo',
		defaults: {
			name: 'Zalo Group',
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
						name: 'Group',
						value: 'zaloGroup',
					},
				],
				default: 'zaloGroup',
			},
			...zaloGroupOperations,
			...zaloGroupFields,
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
				if (resource === 'zaloGroup') {
					// Tạo nhóm
					if (operation === 'createGroup') {
						const groupName = this.getNodeParameter('groupName', i) as string;
						const userIds = this.getNodeParameter('userIds', i) as string;
						const userList = userIds.split(',');
						const response = await api.createGroup({ name: groupName, members: userList });

						returnData.push({
							json: response,
							pairedItem: {
								item: i,
							},
						});
					}

					// Lấy thông tin nhóm
					else if (operation === 'getGroupInfo') {
						const groupId = this.getNodeParameter('groupId', i) as string;

						const response = await api.getGroupInfo(groupId);
						const groupInfo = response.gridInfoMap[groupId];

						returnData.push({
							json: {
								response: response,
								groupInfo: groupInfo,
							},
							pairedItem: {
								item: i,
							},
						});
					}

					// Thêm phó nhóm
					else if (operation === 'addGroupDeputy') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const userId = this.getNodeParameter('userId', i) as string;

						const response = await api.addGroupDeputy(groupId, userId);

						returnData.push({
							json: {
								status: 'Thành công',
								response: response,
							},
							pairedItem: {
								item: i,
							},
						});
					}

					// Thêm thành viên vào nhóm
					else if (operation === 'addUserToGroup') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const userIds = this.getNodeParameter('userIds', i) as string;
						const userList = userIds.split(',');

						const response = await api.addUserToGroup(userList, groupId);

						returnData.push({
							json: response,
							pairedItem: {
								item: i,
							},
						});
					}

					// Đổi avatar nhóm
					else if (operation === 'changeGroupAvatar') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const imageUrl = this.getNodeParameter('imageUrl', i) as string;

						const response = await api.changeGroupAvatar(groupId, imageUrl);

						returnData.push({
							json: {
								status: 'Thành công',
								response: response,
							},
							pairedItem: {
								item: i,
							},
						});
					}

					// Đổi tên nhóm
					else if (operation === 'changeGroupName') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const newName = this.getNodeParameter('newName', i) as string;

						const response = await api.changeGroupName(groupId, newName);

						returnData.push({
							json: response,
							pairedItem: {
								item: i,
							},
						});
					}

					// Lấy danh sách thành viên
					else if (operation === 'getGroupMembers') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const limit = this.getNodeParameter('limit', i) as number;

						const response = await api.getGroupInfo(groupId);
						const groupInfo = response.gridInfoMap[groupId];
						const members = groupInfo.memberIds?.slice(0, limit) || [];
						const admins = groupInfo.adminIds || [];
						const currentMems = groupInfo.currentMems || [];
						const updateMems = groupInfo.updateMems || [];
						const totalMember = groupInfo.totalMember || 0;

						returnData.push({
							json: { members, admins, currentMems, updateMems, totalMember } as IDataObject,
							pairedItem: {
								item: i,
							},
						});
					}

					// Lấy tất cả nhóm
					else if (operation === 'getAllGroups') {
						const response = await api.getAllGroups();

						returnData.push({
							json: { response } as IDataObject,
							pairedItem: {
								item: i,
							},
						});
					}

					// Xóa thành viên khỏi nhóm
					else if (operation === 'removeUserFromGroup') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const userIds = this.getNodeParameter('userIds', i) as string;
						const userList = userIds.split(',');

						const response = await api.removeUserFromGroup(userList, groupId);

						returnData.push({
							json: response,
							pairedItem: {
								item: i,
							},
						});
					}

					// Tạo ghi chú
					else if (operation === 'createNote') {
						const groupId = this.getNodeParameter('groupId', i) as string;
						const content = this.getNodeParameter('content', i) as string;
						const pinAct = this.getNodeParameter('pinAct', i) as boolean;
						const options = {
							title: content,
							pinAct: pinAct,
						};
						const response = await api.createNote(options, groupId);

						returnData.push({
							json: {
								status: 'Thành công',
								response: response,
							},
							pairedItem: {
								item: i,
							},
						});
					}
				}
			} catch (error) {
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
