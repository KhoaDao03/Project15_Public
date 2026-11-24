const form=document.getElementById('login-form');
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button'),error=document.getElementById('login-error');button.disabled=true;error.textContent='';
 try{
  const response=await fetch('/api/discord/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('password').value})});
  if(!response.ok){error.textContent=response.status===429?'Too many attempts. Please wait a minute and try again.':'Incorrect password. Try again.';return}
  document.getElementById('password').value='';location.replace('/discord');
 }catch{error.textContent='Unable to connect. Please try again.'}finally{button.disabled=false}
});
