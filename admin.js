document.addEventListener('DOMContentLoaded', () => {
    // --- AUTHENTICATION CHECK ---
    auth.onAuthStateChanged(user => {
        if (user && user.email === "admin@company.com") {
            // User is admin, initialize the dashboard
            initializeAdminDashboard();
        } else {
            // User is not admin or not logged in, redirect to login
            window.location.replace('index.html');
        }
    });

    // --- UTILITIES ---
    const showMessage = (title, text, isSuccess = true) => {
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        const messageModal = document.getElementById('message-modal');
        const messageIcon = messageModal.querySelector('#message-icon');
        const messageTitle = messageModal.querySelector('#message-title');
        const messageText = messageModal.querySelector('#message-text');
        messageTitle.textContent = title;
        messageText.textContent = text;
        messageIcon.innerHTML = isSuccess ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        showModal(messageModal);
    };

    const showModal = (modalElement) => {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.classList.add('show');
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
            modalElement.style.display = 'block';
        }
    };

    const hideModals = () => {
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) modalContainer.classList.remove('show');
    };

    // --- GLOBAL STATE ---
    let allEmployeeData = [];
    let currentlyViewedEmployeeId = null;

    // --- CORE DATA FETCHING ---
    const fetchData = async () => {
        try {
            const employeeSnapshot = await db.collection('employees').get();
            allEmployeeData = employeeSnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
            return true;
        } catch (error) {
            console.error("Error fetching employee data:", error);
            showMessage("Data Error", `Could not load data: ${error.message}`, false);
            return false;
        }
    };

    // --- DASHBOARD RENDERING FUNCTIONS ---
    const loadDashboardOverview = async () => {
        await fetchData(); // Ensure data is fresh
        const attendanceSnapshot = await db.collection('attendance')
            .where('timestamp', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
            .get();

        const totalEmployees = allEmployeeData.length;
        const todayPresent = attendanceSnapshot.size;
        const notCheckedIn = totalEmployees - todayPresent;
        const totalSalary = allEmployeeData.reduce((sum, emp) => sum + (emp.baseSalary || 0), 0);

        document.getElementById('total-employees-stat').textContent = totalEmployees;
        document.getElementById('today-present-stat').textContent = todayPresent;
        document.getElementById('not-checked-in-stat').textContent = notCheckedIn;
        document.getElementById('avg-salary-stat').textContent = `₹${totalSalary.toLocaleString()}`;
    };

    const loadManageEmployees = () => {
        const tableBody = document.getElementById('admin-table-body');
        tableBody.innerHTML = '';
        allEmployeeData.forEach(emp => {
            tableBody.innerHTML += `
                <tr>
                    <td>${emp.name}</td>
                    <td>${emp.email}</td>
                    <td>${emp.phone}</td>
                    <td>₹${emp.baseSalary.toLocaleString()}</td>
                    <td class="actions-cell">
                        <button class="btn btn-danger btn-small delete-employee-btn" data-doc-id="${emp.docId}" data-uid="${emp.uid}" data-name="${emp.name}"><i class="fas fa-trash"></i> Delete</button>
                    </td>
                </tr>`;
        });

        // Add event listeners for delete buttons
        tableBody.querySelectorAll('.delete-employee-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { docId, uid, name } = e.currentTarget.dataset;
                if (confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
                    // Note: Deleting Firebase Auth users requires a backend (Cloud Function) for security.
                    // This will only delete the Firestore record.
                    db.collection('employees').doc(docId).delete().then(() => {
                        showMessage("Success", `${name} has been removed.`, true);
                        refreshAllData();
                    }).catch(err => showMessage("Error", err.message, false));
                }
            });
        });
    };
    
    // MODIFIED: Live attendance feed
    const listenForAttendance = () => {
        const attendanceList = document.getElementById('attendance-list');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        db.collection('attendance')
            .where('timestamp', '>=', todayStart)
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                attendanceList.innerHTML = ''; // Clear list
                if (snapshot.empty) {
                    attendanceList.innerHTML = '<li>No attendance marked yet today.</li>';
                    return;
                }
                snapshot.forEach(doc => {
                    const record = doc.data();
                    const time = record.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${record.name}</strong> checked in at ${time}`;
                    attendanceList.appendChild(li);
                });
            });
    };

    const loadAttendanceHistory = async () => {
        const dateFilter = document.getElementById('history-date-filter').value;
        if (!dateFilter) return;

        const tableBody = document.getElementById('attendance-history-table-body');
        tableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
        
        const selectedDate = new Date(dateFilter);
        const start = new Date(selectedDate.setHours(0, 0, 0, 0));
        const end = new Date(selectedDate.setHours(23, 59, 59, 999));
        
        const snapshot = await db.collection('attendance')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .orderBy('timestamp', 'desc')
            .get();

        tableBody.innerHTML = '';
        if (snapshot.empty) {
            tableBody.innerHTML = `<tr><td colspan="4">No records found for ${dateFilter}.</td></tr>`;
        } else {
            snapshot.forEach(doc => {
                const data = doc.data();
                const time = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                tableBody.innerHTML += `
                    <tr>
                        <td>${data.timestamp.toDate().toLocaleDateString()}</td>
                        <td>${data.name}</td>
                        <td>${data.email}</td>
                        <td>${time}</td>
                    </tr>`;
            });
        }
    };
    
    const loadSalaryAdvanceSection = () => {
        const employeeList = document.getElementById('employee-advance-list');
        employeeList.innerHTML = '';
        allEmployeeData.forEach(emp => {
            const li = document.createElement('li');
            li.dataset.employeeDocId = emp.docId;
            li.innerHTML = `<span class="employee-name">${emp.name}</span><span class="employee-id">${emp.email}</span>`;
            li.addEventListener('click', () => showAdvanceDetailsModal(emp.docId));
            employeeList.appendChild(li);
        });
    };
    
    const showAdvanceDetailsModal = async (docId) => {
        currentlyViewedEmployeeId = docId;
        const employee = allEmployeeData.find(emp => emp.docId === docId);
        if (!employee) return;
        
        document.getElementById('adv-modal-name').textContent = employee.name;

        const historyBody = document.getElementById('adv-history-body');
        historyBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
        
        const advancesSnapshot = await db.collection('employees').doc(docId).collection('advances').orderBy('date', 'desc').get();
        historyBody.innerHTML = '';
        if(advancesSnapshot.empty) {
            historyBody.innerHTML = '<tr><td colspan="2">No advances this month.</td></tr>';
        } else {
            advancesSnapshot.forEach(doc => {
                const advance = doc.data();
                historyBody.innerHTML += `<tr>
                    <td>${advance.date.toDate().toLocaleDateString()}</td>
                    <td>₹${advance.amount}</td>
                </tr>`;
            });
        }
        showModal(document.getElementById('advance-details-modal'));
    };

    const handleRecordAdvance = async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('advance-amount').value);
        if (!currentlyViewedEmployeeId || !amount || amount <= 0) {
            return showMessage("Error", "Invalid amount.", false);
        }

        try {
            await db.collection('employees').doc(currentlyViewedEmployeeId).collection('advances').add({
                amount: amount,
                date: firebase.firestore.Timestamp.now()
            });
            showMessage("Success", "Advance recorded.", true);
            e.target.reset();
            showAdvanceDetailsModal(currentlyViewedEmployeeId); // Refresh modal
        } catch (error) {
            showMessage("Error", error.message, false);
        }
    };
    
    const refreshAllData = async () => {
        await fetchData();
        const activeSection = document.querySelector('.content-section.active').id;
        
        if (activeSection === 'dashboard-overview-content') loadDashboardOverview();
        if (activeSection === 'manage-employees-content') loadManageEmployees();
    };

    // --- INITIALIZATION ---
    function initializeAdminDashboard() {
        // Initial data load
        fetchData().then(() => {
            loadDashboardOverview();
        });
        
        // Navigation
        const navLinks = document.querySelectorAll('.sidebar-nav a');
        const contentSections = document.querySelectorAll('.content-section');
        const pageTitle = document.getElementById('page-title');

        const activateSection = (sectionId, navId, title) => {
            contentSections.forEach(section => section.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            navLinks.forEach(link => link.classList.remove('active'));
            document.getElementById(navId).classList.add('active');
            pageTitle.textContent = title;
        };

        const navActions = {
            'nav-dashboard': () => { activateSection('dashboard-overview-content', 'nav-dashboard', 'Dashboard Overview'); loadDashboardOverview(); },
            'nav-employees': () => { activateSection('manage-employees-content', 'nav-employees', 'Manage Employees'); loadManageEmployees(); },
            'nav-attendance': () => { activateSection('attendance-system-content', 'nav-attendance', "Today's Attendance Feed"); listenForAttendance(); },
            'nav-history': () => {
                 activateSection('attendance-history-content', 'nav-history', 'Attendance History');
                 document.getElementById('history-date-filter').valueAsDate = new Date();
                 loadAttendanceHistory();
            },
            'nav-advances': () => { activateSection('salary-advances-content', 'nav-advances', 'Salary Advances'); loadSalaryAdvanceSection(); },
            'nav-reports': () => activateSection('reports-analytics-content', 'nav-reports', 'Payroll Reports'),
        };
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navActions[e.currentTarget.id]();
            });
        });
        
        // Event Listeners
        document.getElementById('adminLogoutBtn').addEventListener('click', () => auth.signOut());
        document.getElementById('enrollBtn').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        document.getElementById('quick-enroll-btn').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        document.getElementById('close-enroll-modal').addEventListener('click', hideModals);
        document.getElementById('filterAttendanceBtn').addEventListener('click', loadAttendanceHistory);
        document.getElementById('close-advance-details-modal').addEventListener('click', hideModals);
        document.getElementById('close-message-modal').addEventListener('click', hideModals);

        // Employee Enrollment Form
        document.getElementById('enroll-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const phone = document.getElementById('phone').value;
            const aadhar = document.getElementById('aadhar').value;
            const baseSalary = parseFloat(document.getElementById('salary').value);

            if (password.length < 6) {
                return showMessage("Error", "Password must be at least 6 characters.", false);
            }
            
            try {
                // IMPORTANT: This creates the user in Firebase Auth. But since we are logged in as admin,
                // this can cause a conflict where the admin is logged out. A proper solution uses
                // Cloud Functions, but for this client-side project, we proceed with this known limitation.
                const tempApp = firebase.initializeApp(firebase.app().options, 'secondary');
                const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
                const uid = userCredential.user.uid;
                await tempApp.auth().signOut(); // Sign out the temporary user
                
                // Now save details to Firestore
                await db.collection('employees').doc(uid).set({
                    uid: uid, name, email, phone, aadhar, baseSalary
                });
                
                await db.collection('users').doc(uid).set({
                    name: name,
                    email: email
                });

                hideModals();
                showMessage("Success", "Employee enrolled successfully!", true);
                e.target.reset();
                refreshAllData();

            } catch (error) {
                 if (error.code === 'auth/email-already-in-use') {
                    showMessage('Error', 'This email is already registered.', false);
                } else {
                    showMessage('Error', `An error occurred: ${error.message}`, false);
                }
                console.error("Enrollment error:", error);
            }
        });

        document.getElementById('record-advance-form').addEventListener('submit', handleRecordAdvance);
    }
});