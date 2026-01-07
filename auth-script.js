// 1. Toggle between Login and Register forms
function toggleAuth(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (formType === 'register') {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    } else {
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    }
}

// 2. Mock Login Function
function handleLogin() {
    const user = document.getElementById('loginUser').value;

    if(user) {
        alert(`Login Successful! Welcome, ${user}`);
        
        // This simulates a real login session
        // We save 'true' so the Home Page knows we are logged in
        localStorage.setItem('isLoggedIn', 'true');
        
        // REDIRECT LOGIC:
        // Ideally, go back to where the user came from (Home or Cart)
        // For now, we send them to the Add Cart Page as per your flow
        // "after clicking product -> auth -> add cart page"
        window.location.href = "add_cart_page.html"; 
    } else {
        alert("Please enter a username or mobile number.");
    }
}

// 3. Mock Register Function
function handleRegister() {
    alert("Account created successfully! Please login.");
    toggleAuth('login');
}