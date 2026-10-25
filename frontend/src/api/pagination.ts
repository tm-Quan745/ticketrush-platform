export type Page<T> = {content:T[];page:number;totalPages:number;totalElements:number};
export async function allPages<T>(fetchPage:(page:number)=>Promise<Page<T>>):Promise<T[]> {
 const rows:T[]=[];
 for(let page=0;;page++) {
  const result=await fetchPage(page);
  if(result.page!==page || !Number.isInteger(result.totalPages) || result.totalPages<0)throw new Error('Invalid pagination response');
  rows.push(...result.content);
  if(page+1>=result.totalPages)return rows;
 }
}
