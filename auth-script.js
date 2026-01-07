// 1. Toggle Function (Fixed Logic)
function toggleAuth(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (formType === 'register') {
        // Hide Login, Show Register
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    } else {
        // Hide Register, Show Login
        registerForm.classList.remove('active');
        loginForm.classList.add('active');
    }
}

// 2. Login Logic
function handleLogin() {
    const user = document.getElementById('loginUser').value;

    if(user) {
        alert(`Login Successful! Welcome, ${user}`);
        localStorage.setItem('isLoggedIn', 'true');
        
        // Redirect to Cart Page
        window.location.href = "add_cart_page.html"; 
    } else {
        alert("Please enter your Mobile Number.");
    }
}

// 3. Register Logic
function handleRegister() {
    alert("Account created successfully! Please login.");
    // Auto-switch back to login after signup
    toggleAuth('login');
}
