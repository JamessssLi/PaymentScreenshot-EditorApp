import type { ReceiptDraft } from './model.ts';
import avatarUrl from './assets/merchant-avatar.png';

export const merchantFieldKeys = ['merchant', 'product', 'company', 'acquirer', 'acquirerNote', 'method'] as const;
type MerchantFields = Pick<ReceiptDraft, typeof merchantFieldKeys[number]>;
interface MerchantPreset { id: string; label: string; fields: MerchantFields; avatarUrl: string }

// 两张参考图使用同一头像，只内嵌一份资源；不包含样例交易信息。
export const merchantPresets: readonly MerchantPreset[] = [
  {
    id: 'like-lai', label: '利客来购物中心', avatarUrl,
    fields: {
      merchant: '青岛利客来集团股份有限公司购物中心',
      product: '青岛利客来集团股份有限公司购物中心',
      company: '青岛利客来集团股份有限公司购物中心',
      acquirer: '银联商务支付股份有限公司', acquirerNote: '', method: '零钱',
    },
  },
  {
    id: 'haipai-yiyue', label: '海派怡悦餐厅', avatarUrl,
    fields: {
      merchant: '市北区海派怡悦餐厅', product: '市北区海派怡悦餐厅', company: '市北区海派怡悦餐厅',
      acquirer: '银联商务支付股份有限公司',
      acquirerNote: '由中国银联股份有限公司提供收款清算服务', method: '零钱',
    },
  },
];
