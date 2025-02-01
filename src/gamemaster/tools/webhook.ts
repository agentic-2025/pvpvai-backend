import { CdpAgentkit } from '@coinbase/cdp-agentkit-core';
import { CdpTool } from '@coinbase/cdp-langchain';
import { Wallet, Webhook, WebhookEventType } from '@coinbase/coinbase-sdk';
import { z } from 'zod';

// Define the prompt for the webhook creation action
const CREATE_WEBHOOK_PROMPT = `
This tool manages webhooks using the Coinbase SDK.
It can:
- Create a new webhook (for external address or wallet)
- List existing webhooks
- Update webhook URI or addresses
- Delete webhooks
`;

// Define the input schema using Zod
const WebhookInput = z
  .object({
    action: z
      .enum(['create', 'list', 'update', 'delete'])
      .describe('The webhook action to perform'),
    notificationUri: z
      .string()
      .url()
      .optional()
      .describe('The webhook callback URL (required for create/update)'),
    networkId: z
      .enum([
        'base-mainnet',
        'base-sepolia',
        'ethereum-mainnet',
        'polygon-mainnet',
        'arbitrum-mainnet',
      ])
      .optional()
      .describe('The network ID for the webhook (required for create)'),
    eventType: z
      .enum(['erc20_transfer', 'erc721_transfer'])
      .optional()
      .describe('The event type to monitor (required for create)'),
    contractAddress: z
      .string()
      .optional()
      .describe('The contract address to monitor (for external address webhooks)'),
    walletId: z.string().optional().describe('The wallet ID to monitor (for wallet webhooks)'),
    webhookId: z.string().optional().describe('The webhook ID (required for update/delete)'),
    signatureHeader: z
      .string()
      .optional()
      .describe('Optional signature header for webhook verification'),
  })
  .refine(
    (data) => {
      if (data.action === 'create') {
        return !!data.notificationUri && (!!data.contractAddress || !!data.walletId);
      }
      if (data.action === 'update') {
        return !!data.webhookId && !!data.notificationUri;
      }
      if (data.action === 'delete') {
        return !!data.webhookId;
      }
      return true;
    },
    {
      message: 'Missing required fields for the specified action',
    }
  );

/**
 * Manages webhooks using the Coinbase SDK
 */
async function manageWebhook(args: z.infer<typeof WebhookInput>): Promise<string> {
  try {
    switch (args.action) {
      case 'create': {
        if (args.walletId) {
          // Create wallet webhook
          const wallet = await Wallet.import({ walletData: { id: args.walletId } });
          const webhook = await wallet.createWebhook(args.notificationUri!);
          return JSON.stringify(
            {
              message: 'Wallet webhook created successfully',
              webhook: webhook.toString(),
              walletId: args.walletId,
            },
            null,
            2
          );
        } else {
          // Create external address webhook
          const webhook = await Webhook.create({
            networkId: args.networkId!,
            notificationUri: args.notificationUri!,
            eventType: args.eventType! as WebhookEventType,
            eventFilters: [{ contract_address: args.contractAddress }],
            signatureHeader: args.signatureHeader,
          });
          return JSON.stringify(
            {
              message: 'External address webhook created successfully',
              webhook: webhook.toString(),
            },
            null,
            2
          );
        }
      }

      case 'list': {
        const response = await Webhook.list();
        return JSON.stringify(
          {
            message: 'Webhooks retrieved successfully',
            webhooks: response.data.map((webhook) => webhook.toString()),
          },
          null,
          2
        );
      }

      case 'update': {
        const webhooks = await Webhook.list();
        const webhook = webhooks.data.find((wh) => wh.toString().includes(args.webhookId!));
        if (!webhook) {
          throw new Error(`Webhook with ID ${args.webhookId} not found`);
        }
        await webhook.update({ notificationUri: args.notificationUri! });
        return JSON.stringify(
          {
            message: 'Webhook updated successfully',
            webhook: webhook.toString(),
          },
          null,
          2
        );
      }

      case 'delete': {
        const webhooks = await Webhook.list();
        const webhook = webhooks.data.find((wh) => wh.toString().includes(args.webhookId!));
        if (!webhook) {
          throw new Error(`Webhook with ID ${args.webhookId} not found`);
        }
        await webhook.delete();
        return JSON.stringify(
          {
            message: 'Webhook deleted successfully',
            webhookId: args.webhookId,
          },
          null,
          2
        );
      }

      default:
        throw new Error('Invalid action specified');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Webhook operation failed: ${error.message}`);
    }
    throw new Error('Webhook operation failed: Unknown error');
  }
}

const webhookTool = (agentkit: CdpAgentkit) => {
  return new CdpTool(
    {
      name: 'manage_webhook',
      description: CREATE_WEBHOOK_PROMPT,
      schema: WebhookInput,
      func: manageWebhook,
    },
    agentkit
  );
};

export default webhookTool;
