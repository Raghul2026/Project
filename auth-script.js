// 1. Toggle Function
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

// 2. Login Logic
function handleLogin() {
    const user = document.getElementById('loginUser').value;

    if(user) {
        // Save Login State
        localStorage.setItem('isLoggedIn', 'true');
        
        // Optional: Keep this one so they know it worked, or remove it too if you want silent login
        alert(`Login Successful! Welcome, ${user}`);
        
        // Redirect back to Home Page
        window.location.href = "index.html"; 
    } else {
        alert("Please enter your Mobile Number.");
    }
}

// 3. Register Logic
function handleRegister() {
    alert("Account created successfully! Please login.");
    toggleAuth('login');
}
