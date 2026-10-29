import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EventImageField} from '../src/components/admin/EventImageField';

test('event image previews Cloudinary images but not empty or untrusted URLs',()=>{
 const render=(value:string)=>renderToStaticMarkup(React.createElement(EventImageField,{value,onChange:()=>{}}));
 const url='https://res.cloudinary.com/demo/image/upload/events/banner.jpg';
 assert.match(render(url),/<img/);
 assert.match(render(url),/alt="Xem trước ảnh sự kiện"/);
 for(const value of ['', 'javascript:alert(1)', 'https://res.cloudinary.com.evil.test/demo/image/upload/a.jpg']) {
  assert.doesNotMatch(render(value),/<img/);
 }
 assert.match(render(''),/type="file"/);
 assert.match(render(''),/accept="image\/jpeg,image\/png,image\/gif"/);
});
