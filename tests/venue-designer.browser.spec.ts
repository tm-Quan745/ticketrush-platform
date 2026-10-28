import {test,expect,type Page} from '@playwright/test';
import {createPreset,type VenueDetail,type VenueDraft} from '../frontend/src/features/venues/model';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
function detail(draft:VenueDraft,id:string):VenueDetail {
 return {...draft,id,templateVersion:1,geometry:{width:draft.width,height:draft.height,stage:[draft.stage.x,draft.stage.y,draft.stage.x+draft.stage.width,draft.stage.y+draft.stage.height]},sections:draft.sections.map((s,i)=>({...s,id:`${id}-${i}`,geometry:{color:s.color,polygon:[[s.x,s.y],[s.x+s.width,s.y],[s.x+s.width,s.y+s.height],[s.x,s.y+s.height]]}}))};
}
async function openDesigner(page:Page,options:{light?:boolean;conflict?:boolean}={}){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 if(options.light)await page.addInitScript(()=>localStorage.setItem('ticketrush_theme','light'));
 const existing=detail({...createPreset('theatre'),name:'Nhà hát mẫu',templateKey:'nha-hat-mau'},'existing');
 const venues=[existing];const submissions:any[]=[];
 await page.route('https://**/*',route=>route.abort());
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;let body:unknown={};
  if(path.endsWith('/auth/login'))body={accessToken:'ui-test',refreshToken:'ui-test-refresh'};
  else if(path.endsWith('/auth/me'))body={id:'admin',email:'admin@example.test',roles:['ADMIN']};
  else if(path.endsWith('/admin/venues')&&route.request().method()==='POST'){
   const input=route.request().postDataJSON();submissions.push(input);
   if(options.conflict&&submissions.length===1){await route.fulfill({status:409,json:{message:'Conflict'}});return;}
   const created=detail(input,'created');venues.push(created);body=created;
  }else if(path.endsWith('/admin/venues'))body=venues;
  else if(path.includes('/admin/venues/'))body=venues.find(v=>path.endsWith('/'+v.id));
  else if(path.endsWith('/admin/events'))body={content:[],page:0,totalPages:0,totalElements:0};
  await route.fulfill({json:body});
 });
 await page.goto('/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:true}).fill('admin@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.getByRole('navigation',{name:'Điều hướng quản trị'}).getByRole('link',{name:'Sơ đồ địa điểm',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Nhà hát mẫu',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tạo sơ đồ',exact:true}).click();
 return {errors,submissions};
}

test('visual editing validates collisions, supports undo, and recovers a duplicate-key response without losing work',async({page},testInfo)=>{
 const {errors,submissions}=await openDesigner(page,{conflict:true});
 await page.getByRole('button',{name:/Nhà hát.*Dùng bố cục/}).click();
 await page.getByLabel('Tên địa điểm',{exact:true}).fill('Sân Mỹ Đình');await expect(page.getByLabel('Mã sơ đồ',{exact:true})).toHaveValue('san-my-dinh');
 const canvas=page.getByRole('group',{name:'Trình thiết kế sơ đồ'});
 const coordinates=await canvas.evaluate(el=>{const m=(el as SVGSVGElement).getScreenCTM()!;const a=new DOMPoint(240,255).matrixTransform(m),b=new DOMPoint(320,255).matrixTransform(m);return {a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};});
 await page.mouse.move(coordinates.a.x,coordinates.a.y);await page.mouse.down();await page.mouse.move(coordinates.b.x,coordinates.b.y,{steps:5});await page.mouse.up();
 await expect(page.getByRole('region',{name:'Các lỗi sơ đồ'})).toContainText('chồng lên');
 await page.getByRole('button',{name:'Kiểm tra & lưu',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(submissions).toHaveLength(0);
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(page.getByRole('region',{name:'Các lỗi sơ đồ'})).toHaveCount(0);
 await canvas.getByRole('button',{name:'Chọn Sân khấu',exact:true}).focus();await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('complementary',{name:'Thuộc tính đối tượng'}).getByLabel('Vị trí dọc',{exact:true})).toHaveValue('50');
 await page.getByRole('button',{name:'Thêm khu',exact:true}).click();await expect(canvas.getByRole('button')).toHaveCount(6);
 await page.getByRole('button',{name:'Xóa khu đang chọn',exact:true}).click();await expect(canvas.getByRole('button')).toHaveCount(5);
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(canvas.getByRole('button')).toHaveCount(6);
 await page.getByRole('button',{name:'Hoàn tác',exact:true}).click();await expect(canvas.getByRole('button')).toHaveCount(5);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('editor-dark.png'),fullPage:true,timeout:10000});
 await page.getByRole('button',{name:'Kiểm tra & lưu',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('480 ghế');
 await page.getByRole('button',{name:'Lưu sơ đồ',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Mã sơ đồ đã tồn tại');
 await expect(page.getByLabel('Tên địa điểm',{exact:true})).toHaveValue('Sân Mỹ Đình');
 await page.getByLabel('Mã sơ đồ',{exact:true}).fill('san-my-dinh-2027');
 await page.getByRole('button',{name:'Kiểm tra & lưu',exact:true}).click();await page.getByRole('button',{name:'Lưu sơ đồ',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Đã lưu sơ đồ');expect(submissions).toHaveLength(2);expect(submissions[1].stage.y).toBe(50);expect(submissions[1].sections[0]).not.toHaveProperty('id');expect(errors).toEqual([]);
 await expect(page.getByRole('heading',{name:'Sân Mỹ Đình',exact:true})).toBeVisible();
});

test('light mobile layout allows zone editing and renders a readable review without horizontal overflow',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});const {errors}=await openDesigner(page,{light:true});
 await page.getByRole('button',{name:/Concert.*Dùng bố cục/}).click();await page.getByLabel('Tên địa điểm',{exact:true}).fill('Concert quốc gia');
 const inspector=page.getByRole('complementary',{name:'Thuộc tính đối tượng'});
 await expect(inspector.getByLabel('Loại khu',{exact:true})).toHaveValue('GA');await expect(inspector.getByLabel('Số hàng',{exact:true})).toHaveCount(0);
 await inspector.getByLabel('Loại khu',{exact:true}).selectOption('SEATED');await inspector.getByLabel('Số hàng',{exact:true}).fill('8');
 await expect(inspector).toContainText('Tổng 96 ghế');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:testInfo.outputPath('editor-mobile-light.png'),fullPage:true,timeout:10000});
 await page.getByRole('button',{name:'Kiểm tra & lưu',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByRole('button',{name:'Tiếp tục chỉnh sửa',exact:true}).click();await expect(inspector.getByLabel('Số hàng',{exact:true})).toHaveValue('8');expect(errors).toEqual([]);
});
