const {test}=require('node:test'),assert=require('node:assert/strict');
global.window=global;global.HAK={};require('../app/js/excel.js');
const f=HAK.Excel.util.parseNum;
test('Vietnamese and Excel number text is read correctly',()=>{
 const table={'6500':6500,'6.500':6500,'6,5':6.5,'6.5':6.5,'13.010,81':13010.81,'1.250.000':1250000,'1250000':1250000,'54,1230':54.123,'1,979':1979,'12,345':12345,'1,250,000':1250000,'-6.500':-6500};
 for(const [text,n] of Object.entries(table))assert.equal(f(text),n,text);
});
test('a number starting with 0 and three decimals is a decimal, not thousands',()=>{
 for(const [text,n] of Object.entries({'0,123':0.123,'0,480':0.48,'0.123':0.123,'0.5':0.5,'-0,123':-0.123,'0,5':0.5}))assert.equal(f(text),n,text);
 assert.equal(f('10,123'),10123,'only a leading zero decides; 10,123 keeps the existing thousands reading');
});
test('blank and non-numeric input give null',()=>{for(const v of ['','  ',null,undefined,'abc'])assert.equal(f(v),null);});
