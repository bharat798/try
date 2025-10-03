document.addEventListener('DOMContentLoaded', () => {
    const browser = window.SimpleWebAuthnBrowser;

    
    auth.onAuthStateChanged(async user => {
        if (user) {
            // Check if it's the admin, if so, log them out of employee page
            if (user.email === "admin@company.com") {
                auth.signOut();
                return;
            }
            // User is a logged-in employee, show dashboard
            document.getElementById('user-view').style.display = 'block';
            await loadEmployeeData(user);
        } else {
            // No user, redirect to login
            window.location.replace('index.html');
        }
    });

    // --- DATA LOADING ---
    const loadEmployeeData = async (user) => {
        const userEmailDisplay = document.getElementById('user-email-display');
        userEmailDisplay.textContent = user.email;

        try {
            // Fetch employee details from 'employees' collection
            const employeeDoc = await db.collection('employees').doc(user.uid).get();
            if (!employeeDoc.exists) {
                alert("Your employee data could not be found. Please contact an admin.");
                return auth.signOut();
            }
            const employeeData = employeeDoc.data();

            // Populate dashboard
            document.getElementById('user-name-display').textContent = employeeData.name;
            document.getElementById('user-phone-display').textContent = employeeData.phone;
            document.getElementById('user-aadhar-display').textContent = employeeData.aadhar;
            document.getElementById('user-base-salary-display').textContent = `₹${employeeData.baseSalary.toLocaleString()}`;

            // Fetch and calculate advances for the current month
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const advancesSnapshot = await db.collection('employees').doc(user.uid).collection('advances')
                .where('date', '>=', startOfMonth)
                .get();

            let totalAdvances = 0;
            advancesSnapshot.forEach(doc => {
                totalAdvances += doc.data().amount;
            });
            document.getElementById('user-advances-display').textContent = `- ₹${totalAdvances.toLocaleString()}`;
            
            checkPasskeyRegistration(user.uid);

        } catch (error) {
            console.error("Error loading employee data:", error);
            alert("An error occurred while loading your data.");
        }
    };
    
    // --- EVENT LISTENERS ---
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('register-passkey-btn').addEventListener('click', registerPasskey);
    document.getElementById('mark-attendance-btn').addEventListener('click', markAttendance);


    // --- PASSKEY & ATTENDANCE LOGIC ---
    function bufferToBase64URL(buffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }

    async function checkPasskeyRegistration(uid) {
        const doc = await db.collection('users').doc(uid).get();
        const registerBtn = document.getElementById('register-passkey-btn');
        if (doc.exists && doc.data().passkeyCredential) {
            // CHANGE: Instead of disabling the button, we now hide it completely.
            registerBtn.style.display = 'none';
        }
    }

    async function registerPasskey() {
        const user = auth.currentUser;
        if (!user) return;
        
        const registerBtn = document.getElementById('register-passkey-btn');
        registerBtn.disabled = true;
        registerBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Registering...`;

        const rpId = window.location.hostname;
        const challenge = crypto.getRandomValues(new Uint8Array(32));

        const registrationOptions = {
            rp: { name: 'Employee Portal', id: rpId },
            user: { id: bufferToBase64URL(new TextEncoder().encode(user.uid)), name: user.email, displayName: user.email },
            challenge: bufferToBase64URL(challenge),
            pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
            authenticatorSelection: { userVerification: 'required' }
        };

        try {
            const registrationCredential = await browser.startRegistration(registrationOptions);
            await db.collection('users').doc(user.uid).set({
                passkeyCredential: { id: registrationCredential.id }
            }, { merge: true });
            alert('Passkey registered successfully!');
            // CHANGE: After successful registration, hide the button.
            checkPasskeyRegistration(user.uid);
        } catch (error) {
            alert('Passkey registration failed. Your browser may not support it, or you cancelled the request.');
            console.error(error);
            registerBtn.disabled = false;
            registerBtn.innerHTML = `<i class="fas fa-fingerprint"></i> Register My Passkey`;
        }
    }

    async function markAttendance() {
        const user = auth.currentUser;
        if (!user) return;

        const attendanceBtn = document.getElementById('mark-attendance-btn');
        attendanceBtn.disabled = true;
        attendanceBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

        try {
            // Check if already marked today
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const attendanceQuery = await db.collection('attendance')
                .where('userId', '==', user.uid)
                .where('timestamp', '>=', todayStart)
                .get();

            if (!attendanceQuery.empty) {
                alert('You have already marked your attendance today.');
                attendanceBtn.disabled = true; // Keep it disabled if already marked
                attendanceBtn.innerHTML = '<i class="fas fa-check-double"></i> Attendance Marked Today';
                return;
            }

            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists || !userDoc.data().passkeyCredential) {
                alert('You must register a passkey first.');
                attendanceBtn.disabled = false;
                attendanceBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Mark My Attendance';
                return;
            }

            const credentialId = userDoc.data().passkeyCredential.id;
            const challenge = crypto.getRandomValues(new Uint8Array(32));

            const authenticationOptions = {
                challenge: bufferToBase64URL(challenge),
                allowCredentials: [{ id: credentialId, type: 'public-key' }],
                userVerification: 'required',
            };

            await browser.startAuthentication(authenticationOptions);
            
            // Authentication successful, now get full name from 'employees' collection
            const employeeDoc = await db.collection('employees').doc(user.uid).get();
            const userName = employeeDoc.exists ? employeeDoc.data().name : user.email;

            await db.collection('attendance').add({
                userId: user.uid,
                name: userName,
                email: user.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            alert('Attendance marked successfully!');
            attendanceBtn.innerHTML = '<i class="fas fa-check-double"></i> Attendance Marked!';

        } catch (error) {
            alert('Verification failed. Please try again.');
            console.error(error);
            attendanceBtn.disabled = false;
            attendanceBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Mark My Attendance';
        }
    }
});

