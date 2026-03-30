import { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class ZaloApi implements ICredentialType {
	name = 'zaloApi';
	displayName = 'Zalo API';
	documentationUrl = 'https://developers.zalo.me/docs';

	icon: Icon = 'file:shared/zalo.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Cookie',
			name: 'cookie',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			description: 'Cookie from Zalo login session',
		},
		{
			displayName: 'IMEI',
			name: 'imei',
			type: 'string',
			default: '',
			description: 'IMEI identifier from Zalo login session',
		},
		{
			displayName: 'User Agent',
			name: 'userAgent',
			type: 'string',
			default: '',
			description: 'User Agent from Zalo login session',
		},
		{
			displayName: 'Proxy',
			name: 'proxy',
			type: 'string',
			default: '',
			placeholder: 'http(s)://user:pass@host:port',
			description: 'HTTP proxy to use for Zalo API requests',
		},
	];
}
