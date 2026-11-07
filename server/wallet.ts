import { ApiError, getReport, historyPage, MAX_OFFSET, PERIODS } from "../lib/txflow";
import type { Network, Period } from "../lib/txflow";

export async function GET(request: Request) {
  const p=new URL(request.url).searchParams;
  const address=p.get('address')??'';
  const network=p.get('network')??'mainnet';
  const period=p.get('period')??'ALLTIME';
  const kind=p.get('kind')??'report';
  const offset=Number(p.get('offset')??'0');
  const end=Number(p.get('end')??Date.now());
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(!/^0x[a-fA-F0-9]{40}$/.test(address) || !['mainnet','testnet'].includes(network) || !(PERIODS as readonly string[]).includes(period) || !['report','fills','ledger'].includes(kind) || !Number.isInteger(offset) || offset<0 || offset>MAX_OFFSET || !Number.isSafeInteger(end) || end<1577836800000 || end>Date.now()+60000) {
    return Response.json({error:'Invalid request parameters.'},{status:400,headers});
  }
  try {
    const result=kind==='report'
      ? await getReport(network as Network,address.toLowerCase(),period as Period,end)
      : await historyPage(network as Network,address.toLowerCase(),period as Period,end,kind as 'fills'|'ledger',offset);
    return Response.json(result,{headers});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Could not retrieve wallet data.'},{status:error instanceof ApiError?error.status:502,headers});
  }
}
