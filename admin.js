document.addEventListener('DOMContentLoaded', () => {
    let allEmployeeData = [];
    let currentlyViewedEmployee = null;
    let calendarDate = new Date();

    // --- AUTHENTICATION CHECK ---
    auth.onAuthStateChanged(user => {
        if (user && user.email === "admin@company.com") {
            initializeAdminDashboard();
        } else {
            window.location.replace('index.html');
        }
    });

    // --- UTILITY FUNCTIONS ---
    const formatDate = (d) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-GB') : 'N/A';

    const generateEmployeeId = () => {
        const date = new Date();
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const randomDigits = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        return `EMP${year}${month}${randomDigits}`;
    };
    
    const showModal = (modal) => { 
        if (!modal) return;
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById('modal-container').classList.add('show');
        modal.style.display = 'block';
    };

    const hideModals = () => { 
        const container = document.getElementById('modal-container');
        if (container) container.classList.remove('show');
    };

    const showMessage = (title, text, isSuccess = true) => {
        const messageModal = document.getElementById('message-modal');
        if (!messageModal) return;
        messageModal.querySelector('#message-title').textContent = title;
        messageModal.querySelector('#message-text').textContent = text;
        messageModal.querySelector('#message-icon').innerHTML = isSuccess 
            ? '<i class="fas fa-check-circle" style="color: green; font-size: 3em;"></i>' 
            : '<i class="fas fa-times-circle" style="color: red; font-size: 3em;"></i>';
        showModal(messageModal);
    };

    // --- INITIALIZATION ---
    function initializeAdminDashboard() {
        initializeNavigation();
        loadDashboardOverview();
        initializeModalsAndForms();
        initializeResponsiveMenu(); // Responsive menu को चालू करें
    }

    // Responsive menu को चलाने का function
    function initializeResponsiveMenu() {
        const menuBtn = document.getElementById('menu-toggle-btn');
        const wrapper = document.querySelector('.dashboard-wrapper');
        if (menuBtn && wrapper) {
            menuBtn.addEventListener('click', () => {
                wrapper.classList.toggle('sidebar-open');
            });
            wrapper.addEventListener('click', (e) => {
                if (e.target === wrapper && wrapper.classList.contains('sidebar-open')) {
                    wrapper.classList.remove('sidebar-open');
                }
            });
        }
    }

    // --- NAVIGATION ---
    function initializeNavigation() {
        const viewMap = {
            'dashboard-overview': { title: 'Dashboard Overview', func: loadDashboardOverview },
            'manage-employees': { title: 'Manage Employees', func: loadManageEmployees },
            'attendance-feed': { title: "Today's Attendance", func: listenForAttendance },
            'attendance-history': { title: 'Attendance History', func: loadAttendanceHistory },
            'salary-advances': { title: 'Salary Advances', func: loadSalaryAdvances },
            'payroll-reports': { title: 'Reports & Analytics', func: () => document.dispatchEvent(new CustomEvent('loadReports')) }
        };
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.dataset.view;
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
                document.getElementById(`${viewName}-view`).classList.add('active');
                document.getElementById('page-title').textContent = viewMap[viewName].title;
                if (viewMap[viewName].func) viewMap[viewName].func();

                // छोटी स्क्रीन पर मेनू को बंद कर दें
                const wrapper = document.querySelector('.dashboard-wrapper');
                if (wrapper.classList.contains('sidebar-open')) {
                    wrapper.classList.remove('sidebar-open');
                }
            });
        });
    }

    // --- CORE DATA FETCHING ---
    async function fetchDataAndProcess() {
        const empSnap = await db.collection('employees').get();
        const employees = empSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const dataPromises = employees.map(async emp => {
            const attenSnap = await db.collection('attendance').where('userId', '==', emp.uid).where('timestamp', '>=', startOfMonth).get();
            const advSnap = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
            const presentDays = attenSnap.size;
            const totalAdvances = advSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);
            return { ...emp, presentDays, totalAdvances, netPayable: Math.round(netPayable) };
        });

        allEmployeeData = await Promise.all(dataPromises);
        return true;
    }

    // --- VIEW-SPECIFIC FUNCTIONS ---
    async function loadDashboardOverview() {
        await fetchDataAndProcess();
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayAtten = await db.collection('attendance').where('timestamp', '>=', todayStart).get();
        const totalSalary = allEmployeeData.reduce((sum, e) => sum + e.baseSalary, 0);
        document.getElementById('stats-grid-container').innerHTML = `
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Employees</h3><p>${allEmployeeData.length}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar-check"></i></div><div class="stat-info"><h3>Today's Check-ins</h3><p>${todayAtten.size}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-user-clock"></i></div><div class="stat-info"><h3>Not Checked In</h3><p>${allEmployeeData.length - todayAtten.size}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div><div class="stat-info"><h3>Total Monthly Salary</h3><p>₹${totalSalary.toLocaleString('en-IN')}</p></div></div>
        `;
    }

    async function loadManageEmployees() {
        await fetchDataAndProcess();
        const tableBody = document.getElementById('admin-table-body');
        tableBody.innerHTML = allEmployeeData.map(emp => `
            <tr>
                <td>${emp.employeeId || 'N/A'}</td>
                <td>${emp.name}</td>
                <td>${emp.phone}</td>
                <td>${formatDate(emp.joiningDate)}</td>
                <td>₹${emp.baseSalary.toLocaleString('en-IN')}</td>
                <td class="actions-cell">
                    <button class="btn btn-primary btn-small view-details-btn" data-uid="${emp.uid}"><i class="fas fa-eye"></i> View</button>
                    <button class="btn btn-danger btn-small delete-employee-btn" data-docid="${emp.docId}" data-name="${emp.name}"><i class="fas fa-trash"></i> Delete</button>
                </td>
            </tr>`).join('');
        tableBody.querySelectorAll('.view-details-btn').forEach(btn => btn.addEventListener('click', (e) => showEmployeeDetailsModal(e.currentTarget.dataset.uid)));
        tableBody.querySelectorAll('.delete-employee-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { docid, name } = e.currentTarget.dataset;
                if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
                    deleteEmployee(docid, name);
                }
            });
        });
    }
    
    async function deleteEmployee(docId, name) {
        try {
            await db.collection('employees').doc(docId).delete();
            showMessage("Success", `${name} has been deleted.`, true);
            loadManageEmployees();
        } catch (error) {
            showMessage("Error", `Could not delete employee: ${error.message}`, false);
        }
    }

    function listenForAttendance() {
        const list = document.getElementById('attendance-list');
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        db.collection('attendance').where('timestamp', '>=', todayStart).orderBy('timestamp', 'desc').onSnapshot(snap => {
            if (snap.empty) { list.innerHTML = '<li>No attendance marked yet today.</li>'; return; }
            list.innerHTML = snap.docs.map(doc => `<li><strong>${doc.data().name}</strong> checked in at ${doc.data().timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</li>`).join('');
        });
    }

    function loadAttendanceHistory() {
        const dateFilter = document.getElementById('history-date-filter');
        const tableBody = document.getElementById('attendance-history-table-body');
        const filterAttendance = async () => {
            if (!dateFilter.value) return;
            const selectedDate = new Date(dateFilter.value);
            const start = new Date(selectedDate); start.setHours(0,0,0,0);
            const end = new Date(selectedDate); end.setHours(23,59,59,999);
            const snap = await db.collection('attendance').where('timestamp', '>=', start).where('timestamp', '<=', end).orderBy('timestamp', 'desc').get();
            if (snap.empty) { tableBody.innerHTML = `<tr><td colspan="4">No records found for ${formatDate(selectedDate)}.</td></tr>`; return; }
            tableBody.innerHTML = snap.docs.map(doc => `<tr><td>${formatDate(doc.data().timestamp)}</td><td>${doc.data().name}</td><td>${doc.data().email}</td><td>${doc.data().timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('');
        };
        document.getElementById('filter-attendance-btn').onclick = filterAttendance;
        dateFilter.valueAsDate = new Date();
        filterAttendance();
    }
    
    async function loadSalaryAdvances() {
        await fetchDataAndProcess();
        const list = document.getElementById('employee-advance-list');
        list.innerHTML = allEmployeeData.map(emp => `<li data-docid="${emp.docId}">${emp.name}</li>`).join('');
        list.querySelectorAll('li').forEach(li => li.addEventListener('click', e => showAdvanceDetailsModal(e.currentTarget.dataset.docid)));
    }

    function initializeModalsAndForms() {
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        document.querySelectorAll('.modal .btn-secondary, .modal .btn-primary[id^="close-"]').forEach(btn => btn.addEventListener('click', hideModals));
        document.getElementById('enroll-btn-quick').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        document.getElementById('enroll-btn-main').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        
        document.getElementById('enroll-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const phone = document.getElementById('phone').value;
            const aadhar = document.getElementById('aadhar').value;
            const baseSalary = parseFloat(document.getElementById('salary').value);
            const joiningDate = new Date(document.getElementById('joining-date').value);
            
            if (password.length < 6) return showMessage("Error", "Password must be at least 6 characters.", false);

            try {
                const tempApp = firebase.initializeApp(firebase.app().options, 'secondary' + new Date().getTime());
                const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
                const uid = userCredential.user.uid;
                await tempApp.auth().signOut();
                await tempApp.delete();

                const employeeId = generateEmployeeId();
                const newEmployeeData = { uid, employeeId, name, email, phone, aadhar, baseSalary, joiningDate };
                await db.collection('employees').doc(uid).set(newEmployeeData);
                await db.collection('users').doc(uid).set({ name, email });
                
                hideModals();
                showMessage("Success", `Employee ${name} enrolled successfully!`, true);
                e.target.reset();
                loadManageEmployees();

            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    showMessage("Error", "This email is already registered.", false);
                } else {
                    showMessage("Error", `Enrollment failed: ${error.message}`, false);
                }
                console.error("Enrollment Error:", error);
            }
        });
        
        document.getElementById('record-advance-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('advance-amount').value);
            if (!currentlyViewedEmployee || !amount) return;
            await db.collection('employees').doc(currentlyViewedEmployee.docId).collection('advances').add({ amount, date: new Date() });
            showMessage("Success", "Advance recorded.", true);
            e.target.reset();
            showAdvanceDetailsModal(currentlyViewedEmployee.docId);
        });

        const updateBtn = document.getElementById('update-old-records-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', async () => {
                if (!confirm("Are you sure you want to generate new IDs for all old employees? This action is permanent and should only be run once.")) {
                    return;
                }
    
                try {
                    const employeesSnapshot = await db.collection('employees').get();
                    const batch = db.batch();
                    let updatedCount = 0;
    
                    employeesSnapshot.forEach(doc => {
                        const employeeData = doc.data();
                        if (!employeeData.employeeId) {
                            const newId = generateEmployeeId();
                            const docRef = db.collection('employees').doc(doc.id);
                            batch.update(docRef, { employeeId: newId });
                            updatedCount++;
                        }
                    });
    
                    if (updatedCount === 0) {
                        showMessage("Info", "No old records needed an update.", true);
                        return;
                    }
    
                    await batch.commit();
                    showMessage("Success", `${updatedCount} employee records have been updated successfully!`, true);
                    loadManageEmployees();
    
                } catch (error) {
                    console.error("Error updating old records:", error);
                    showMessage("Error", `Failed to update records: ${error.message}`, false);
                }
            });
        }
    }

    async function showAdvanceDetailsModal(docId) {
        currentlyViewedEmployee = allEmployeeData.find(e => e.docId === docId);
        document.getElementById('adv-modal-name').textContent = currentlyViewedEmployee.name;
        const advSnap = await db.collection('employees').doc(docId).collection('advances').orderBy('date', 'desc').get();
        const historyBody = document.getElementById('adv-history-body');
        if (advSnap.empty) { 
            historyBody.innerHTML = '<tr><td colspan="2">No advances this month.</td></tr>'; 
        } else {
            historyBody.innerHTML = advSnap.docs.map(doc => `<tr><td>${formatDate(doc.data().date)}</td><td>₹${doc.data().amount}</td></tr>`).join('');
        }
        showModal(document.getElementById('advance-details-modal'));
    }

    async function showEmployeeDetailsModal(uid) {
        currentlyViewedEmployee = allEmployeeData.find(e => e.uid === uid);
        const emp = currentlyViewedEmployee;
        document.getElementById('detail-id').textContent = emp.employeeId || emp.uid;
        document.getElementById('detail-name').textContent = emp.name;
        document.getElementById('detail-phone').textContent = emp.phone;
        document.getElementById('detail-aadhar').textContent = emp.aadhar;
        document.getElementById('detail-joining-date').textContent = formatDate(emp.joiningDate);
        document.getElementById('detail-base-salary').textContent = `₹${emp.baseSalary.toLocaleString('en-IN')}`;
        
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const attenSnapModal = await db.collection('attendance').where('userId', '==', uid).where('timestamp', '>=', startOfMonth).get();
        const advSnapModal = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
        
        const presentDays = attenSnapModal.size;
        const totalAdvances = advSnapModal.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);

        document.getElementById('detail-present-days').textContent = presentDays;
        document.getElementById('detail-advances').textContent = `- ₹${totalAdvances.toLocaleString('en-IN')}`;
        document.getElementById('detail-calculated-salary').textContent = `₹${Math.round(netPayable).toLocaleString('en-IN')}`;
        
        const fullHistorySnap = await db.collection('attendance').where('userId', '==', uid).get();
        const history = fullHistorySnap.docs.map(doc => ({ Timestamp: doc.data().timestamp.toDate() }));
        
        calendarDate = new Date();
        const updateCalendar = () => generateCalendar(calendarDate.getFullYear(), calendarDate.getMonth(), history, 'admin');
        document.getElementById('admin-cal-prev-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); };
        document.getElementById('admin-cal-next-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); };
        updateCalendar();
        
        showModal(document.getElementById('employee-details-modal'));
    }
    
    function generateCalendar(year, month, history, prefix) {
        const grid = document.getElementById(`${prefix}-cal-days-grid`);
        document.getElementById(`${prefix}-cal-month-year-display`).textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
        grid.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="calendar-day-name">${d}</div>`).join('');
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        grid.innerHTML += Array(firstDay).fill('<div class="calendar-date empty"></div>').join('');
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day).setHours(0,0,0,0);
            const isPresent = history.some(r => new Date(r.Timestamp).setHours(0,0,0,0) === date);
            grid.innerHTML += `<div class="calendar-date ${isPresent ? 'present-day' : ''}">${day}</div>`;
        }
        const presentCount = history.filter(r => new Date(r.Timestamp).getFullYear() === year && new Date(r.Timestamp).getMonth() === month).length;
        document.getElementById(`${prefix}-cal-summary`).innerHTML = `<div class="summary-item"><i class="fas fa-check-circle present-icon"></i> Present: <strong>${presentCount} days</strong></div>`;
    }
});




























// document.addEventListener('DOMContentLoaded', () => {
//     let allEmployeeData = [];
//     let currentlyViewedEmployee = null;
//     let calendarDate = new Date();

//     // --- AUTHENTICATION CHECK ---
//     auth.onAuthStateChanged(user => {
//         if (user && user.email === "admin@company.com") {
//             initializeAdminDashboard();
//         } else {
//             window.location.replace('index.html');
//         }
//     });

//     // --- UTILITY FUNCTIONS ---
//     const formatDate = (d) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-GB') : 'N/A';
    
//     const showModal = (modal) => { 
//         if (!modal) return;
//         document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
//         document.getElementById('modal-container').classList.add('show');
//         modal.style.display = 'block';
//     };

//     const hideModals = () => { 
//         const container = document.getElementById('modal-container');
//         if (container) container.classList.remove('show');
//     };

//     const showMessage = (title, text, isSuccess = true) => {
//         const messageModal = document.getElementById('message-modal');
//         if (!messageModal) return;
//         messageModal.querySelector('#message-title').textContent = title;
//         messageModal.querySelector('#message-text').textContent = text;
//         messageModal.querySelector('#message-icon').innerHTML = isSuccess 
//             ? '<i class="fas fa-check-circle" style="color: green; font-size: 3em;"></i>' 
//             : '<i class="fas fa-times-circle" style="color: red; font-size: 3em;"></i>';
//         showModal(messageModal);
//     };

//     // --- INITIALIZATION ---
//     function initializeAdminDashboard() {
//         initializeNavigation();
//         loadDashboardOverview();
//         initializeModalsAndForms();
//     }

//     // --- NAVIGATION ---
//     function initializeNavigation() {
//         const viewMap = {
//             'dashboard-overview': { title: 'Dashboard Overview', func: loadDashboardOverview },
//             'manage-employees': { title: 'Manage Employees', func: loadManageEmployees },
//             'attendance-feed': { title: "Today's Attendance", func: listenForAttendance },
//             'attendance-history': { title: 'Attendance History', func: loadAttendanceHistory },
//             'salary-advances': { title: 'Salary Advances', func: loadSalaryAdvances },
//             'payroll-reports': { title: 'Reports & Analytics', func: () => document.dispatchEvent(new CustomEvent('loadReports')) }
//         };
//         document.querySelectorAll('.nav-link').forEach(link => {
//             link.addEventListener('click', (e) => {
//                 e.preventDefault();
//                 const viewName = link.dataset.view;
//                 document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
//                 link.classList.add('active');
//                 document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
//                 document.getElementById(`${viewName}-view`).classList.add('active');
//                 document.getElementById('page-title').textContent = viewMap[viewName].title;
//                 if (viewMap[viewName].func) viewMap[viewName].func();
//             });
//         });
//     }

//     // --- CORE DATA FETCHING ---
//     async function fetchDataAndProcess() {
//         const empSnap = await db.collection('employees').get();
//         const employees = empSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
//         const today = new Date();
//         const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
//         const dataPromises = employees.map(async emp => {
//             const attenSnap = await db.collection('attendance').where('userId', '==', emp.uid).where('timestamp', '>=', startOfMonth).get();
//             const advSnap = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
//             const presentDays = attenSnap.size;
//             const totalAdvances = advSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
//             const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);
//             return { ...emp, presentDays, totalAdvances, netPayable: Math.round(netPayable) };
//         });

//         allEmployeeData = await Promise.all(dataPromises);
//         return true;
//     }

//     // --- VIEW-SPECIFIC FUNCTIONS ---
//     async function loadDashboardOverview() {
//         await fetchDataAndProcess();
//         const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
//         const todayAtten = await db.collection('attendance').where('timestamp', '>=', todayStart).get();
//         const totalSalary = allEmployeeData.reduce((sum, e) => sum + e.baseSalary, 0);
//         document.getElementById('stats-grid-container').innerHTML = `
//             <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Employees</h3><p>${allEmployeeData.length}</p></div></div>
//             <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar-check"></i></div><div class="stat-info"><h3>Today's Check-ins</h3><p>${todayAtten.size}</p></div></div>
//             <div class="stat-card"><div class="stat-icon"><i class="fas fa-user-clock"></i></div><div class="stat-info"><h3>Not Checked In</h3><p>${allEmployeeData.length - todayAtten.size}</p></div></div>
//             <div class="stat-card"><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div><div class="stat-info"><h3>Total Monthly Salary</h3><p>₹${totalSalary.toLocaleString('en-IN')}</p></div></div>
//         `;
//     }

//     async function loadManageEmployees() {
//         await fetchDataAndProcess();
//         const tableBody = document.getElementById('admin-table-body');
//         tableBody.innerHTML = allEmployeeData.map(emp => `
//             <tr>
//                 <td>${emp.name}</td>
//                 <td>${emp.phone}</td>
//                 <td>${formatDate(emp.joiningDate)}</td>
//                 <td>₹${emp.baseSalary.toLocaleString('en-IN')}</td>
//                 <td class="actions-cell">
//                     <button class="btn btn-primary btn-small view-details-btn" data-uid="${emp.uid}"><i class="fas fa-eye"></i> View</button>
//                     <button class="btn btn-danger btn-small delete-employee-btn" data-docid="${emp.docId}" data-name="${emp.name}"><i class="fas fa-trash"></i> Delete</button>
//                 </td>
//             </tr>`).join('');
//         tableBody.querySelectorAll('.view-details-btn').forEach(btn => btn.addEventListener('click', (e) => showEmployeeDetailsModal(e.currentTarget.dataset.uid)));
//         tableBody.querySelectorAll('.delete-employee-btn').forEach(btn => {
//             btn.addEventListener('click', (e) => {
//                 const { docid, name } = e.currentTarget.dataset;
//                 if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
//                     deleteEmployee(docid, name);
//                 }
//             });
//         });
//     }
    
//     async function deleteEmployee(docId, name) {
//         try {
//             await db.collection('employees').doc(docId).delete();
//             showMessage("Success", `${name} has been deleted.`, true);
//             loadManageEmployees();
//         } catch (error) {
//             showMessage("Error", `Could not delete employee: ${error.message}`, false);
//         }
//     }

//     function listenForAttendance() {
//         const list = document.getElementById('attendance-list');
//         const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
//         db.collection('attendance').where('timestamp', '>=', todayStart).orderBy('timestamp', 'desc').onSnapshot(snap => {
//             if (snap.empty) { list.innerHTML = '<li>No attendance marked yet today.</li>'; return; }
//             list.innerHTML = snap.docs.map(doc => `<li><strong>${doc.data().name}</strong> checked in at ${doc.data().timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</li>`).join('');
//         });
//     }

//     function loadAttendanceHistory() {
//         const dateFilter = document.getElementById('history-date-filter');
//         const tableBody = document.getElementById('attendance-history-table-body');
//         const filterAttendance = async () => {
//             if (!dateFilter.value) return;
//             const selectedDate = new Date(dateFilter.value);
//             const start = new Date(selectedDate); start.setHours(0,0,0,0);
//             const end = new Date(selectedDate); end.setHours(23,59,59,999);
//             const snap = await db.collection('attendance').where('timestamp', '>=', start).where('timestamp', '<=', end).orderBy('timestamp', 'desc').get();
//             if (snap.empty) { tableBody.innerHTML = `<tr><td colspan="4">No records found for ${formatDate(selectedDate)}.</td></tr>`; return; }
//             tableBody.innerHTML = snap.docs.map(doc => `<tr><td>${formatDate(doc.data().timestamp)}</td><td>${doc.data().name}</td><td>${doc.data().email}</td><td>${doc.data().timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('');
//         };
//         document.getElementById('filter-attendance-btn').onclick = filterAttendance;
//         dateFilter.valueAsDate = new Date();
//         filterAttendance();
//     }
    
//     async function loadSalaryAdvances() {
//         await fetchDataAndProcess();
//         const list = document.getElementById('employee-advance-list');
//         list.innerHTML = allEmployeeData.map(emp => `<li data-docid="${emp.docId}">${emp.name}</li>`).join('');
//         list.querySelectorAll('li').forEach(li => li.addEventListener('click', e => showAdvanceDetailsModal(e.currentTarget.dataset.docid)));
//     }

//     function initializeModalsAndForms() {
        
//         document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
//         document.querySelectorAll('.modal .btn-secondary, .modal .btn-primary[id^="close-"]').forEach(btn => btn.addEventListener('click', hideModals));
//         document.getElementById('enroll-btn-quick').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
//         document.getElementById('enroll-btn-main').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        
//         document.getElementById('enroll-form').addEventListener('submit', async (e) => {
//             e.preventDefault();
//             const name = document.getElementById('name').value;
//             const email = document.getElementById('email').value;
//             const password = document.getElementById('password').value;
//             const phone = document.getElementById('phone').value;
//             const aadhar = document.getElementById('aadhar').value;
//             const baseSalary = parseFloat(document.getElementById('salary').value);
//             const joiningDate = new Date(document.getElementById('joining-date').value);
            
//             if (password.length < 6) return showMessage("Error", "Password must be at least 6 characters.", false);

//             try {
//                 // Simplified Logic: No automatic ID or transaction
//                 const tempApp = firebase.initializeApp(firebase.app().options, 'secondary' + new Date().getTime());
//                 const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
//                 const uid = userCredential.user.uid;
//                 await tempApp.auth().signOut();
//                 await tempApp.delete();

//                 const newEmployeeData = { uid, name, email, phone, aadhar, baseSalary, joiningDate };
//                 await db.collection('employees').doc(uid).set(newEmployeeData);
//                 await db.collection('users').doc(uid).set({ name, email });
                
//                 hideModals();
//                 showMessage("Success", `Employee ${name} enrolled successfully!`, true);
//                 e.target.reset();
//                 loadManageEmployees();

//             } catch (error) {
//                 if (error.code === 'auth/email-already-in-use') {
//                     showMessage("Error", "This email is already registered.", false);
//                 } else {
//                     showMessage("Error", `Enrollment failed: ${error.message}`, false);
//                 }
//                 console.error("Enrollment Error:", error);
//             }
//         });
        
//         document.getElementById('record-advance-form').addEventListener('submit', async (e) => {
//             e.preventDefault();
//             const amount = parseFloat(document.getElementById('advance-amount').value);
//             if (!currentlyViewedEmployee || !amount) return;
//             await db.collection('employees').doc(currentlyViewedEmployee.docId).collection('advances').add({ amount, date: new Date() });
//             showMessage("Success", "Advance recorded.", true);
//             e.target.reset();
//             showAdvanceDetailsModal(currentlyViewedEmployee.docId);
//         });
//     }

//     async function showAdvanceDetailsModal(docId) {
//         currentlyViewedEmployee = allEmployeeData.find(e => e.docId === docId);
//         document.getElementById('adv-modal-name').textContent = currentlyViewedEmployee.name;
//         const advSnap = await db.collection('employees').doc(docId).collection('advances').orderBy('date', 'desc').get();
//         const historyBody = document.getElementById('adv-history-body');
//         if (advSnap.empty) { 
//             historyBody.innerHTML = '<tr><td colspan="2">No advances this month.</td></tr>'; 
//         } else {
//             historyBody.innerHTML = advSnap.docs.map(doc => `<tr><td>${formatDate(doc.data().date)}</td><td>₹${doc.data().amount}</td></tr>`).join('');
//         }
//         showModal(document.getElementById('advance-details-modal'));
//     }

//     async function showEmployeeDetailsModal(uid) {
//         currentlyViewedEmployee = allEmployeeData.find(e => e.uid === uid);
//         const emp = currentlyViewedEmployee;
//         document.getElementById('detail-id').textContent = emp.uid;
//         document.getElementById('detail-name').textContent = emp.name;
//         document.getElementById('detail-phone').textContent = emp.phone;
//         document.getElementById('detail-aadhar').textContent = emp.aadhar;
//         document.getElementById('detail-joining-date').textContent = formatDate(emp.joiningDate);
//         document.getElementById('detail-base-salary').textContent = `₹${emp.baseSalary.toLocaleString('en-IN')}`;
        
//         const today = new Date();
//         const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
//         const attenSnapModal = await db.collection('attendance').where('userId', '==', uid).where('timestamp', '>=', startOfMonth).get();
//         const advSnapModal = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
        
//         const presentDays = attenSnapModal.size;
//         const totalAdvances = advSnapModal.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
//         const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);

//         document.getElementById('detail-present-days').textContent = presentDays;
//         document.getElementById('detail-advances').textContent = `- ₹${totalAdvances.toLocaleString('en-IN')}`;
//         document.getElementById('detail-calculated-salary').textContent = `₹${Math.round(netPayable).toLocaleString('en-IN')}`;
        
//         const fullHistorySnap = await db.collection('attendance').where('userId', '==', uid).get();
//         const history = fullHistorySnap.docs.map(doc => ({ Timestamp: doc.data().timestamp.toDate() }));
        
//         calendarDate = new Date();
//         const updateCalendar = () => generateCalendar(calendarDate.getFullYear(), calendarDate.getMonth(), history, 'admin');
//         document.getElementById('admin-cal-prev-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); };
//         document.getElementById('admin-cal-next-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); };
//         updateCalendar();
        
//         showModal(document.getElementById('employee-details-modal'));
//     }
    
//     function generateCalendar(year, month, history, prefix) {
//         const grid = document.getElementById(`${prefix}-cal-days-grid`);
//         document.getElementById(`${prefix}-cal-month-year-display`).textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
//         grid.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="calendar-day-name">${d}</div>`).join('');
//         const daysInMonth = new Date(year, month + 1, 0).getDate();
//         const firstDay = new Date(year, month, 1).getDay();
//         grid.innerHTML += Array(firstDay).fill('<div class="calendar-date empty"></div>').join('');
//         for (let day = 1; day <= daysInMonth; day++) {
//             const date = new Date(year, month, day).setHours(0,0,0,0);
//             const isPresent = history.some(r => new Date(r.Timestamp).setHours(0,0,0,0) === date);
//             grid.innerHTML += `<div class="calendar-date ${isPresent ? 'present-day' : ''}">${day}</div>`;
//         }
//         const presentCount = history.filter(r => new Date(r.Timestamp).getFullYear() === year && new Date(r.Timestamp).getMonth() === month).length;
//         document.getElementById(`${prefix}-cal-summary`).innerHTML = `<div class="summary-item"><i class="fas fa-check-circle present-icon"></i> Present: <strong>${presentCount} days</strong></div>`;
//     }
// });















// document.addEventListener('DOMContentLoaded', () => {
//     // --- AUTHENTICATION CHECK ---
//     auth.onAuthStateChanged(user => {
//         if (user && user.email === "admin@company.com") {
//             // User is admin, initialize the dashboard
//             initializeAdminDashboard();
//         } else {
//             // User is not admin or not logged in, redirect to login
//             window.location.replace('index.html');
//         }
//     });

//     // --- UTILITIES ---

//     // CHANGE: New centralized function to format dates as DD/MM/YYYY
//     const formatDate = (dateInput) => {
//         if (!dateInput) return 'N/A';
//         // Convert Firebase Timestamp to JS Date if necessary
//         const dateObj = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
//         if (isNaN(dateObj.getTime())) return 'Invalid Date';

//         const day = String(dateObj.getDate()).padStart(2, '0');
//         const month = String(dateObj.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
//         const year = dateObj.getFullYear();

//         return `${day}/${month}/${year}`;
//     };

//     const showMessage = (title, text, isSuccess = true) => {
//         const modalContainer = document.getElementById('modal-container');
//         if (!modalContainer) return;
//         const messageModal = document.getElementById('message-modal');
//         const messageIcon = messageModal.querySelector('#message-icon');
//         const messageTitle = messageModal.querySelector('#message-title');
//         const messageText = messageModal.querySelector('#message-text');
//         messageTitle.textContent = title;
//         messageText.textContent = text;
//         messageIcon.innerHTML = isSuccess ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
//         showModal(messageModal);
//     };

//     const showModal = (modalElement) => {
//         const modalContainer = document.getElementById('modal-container');
//         if (modalContainer) {
//             modalContainer.classList.add('show');
//             document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
//             modalElement.style.display = 'block';
//         }
//     };

//     const hideModals = () => {
//         const modalContainer = document.getElementById('modal-container');
//         if (modalContainer) modalContainer.classList.remove('show');
//     };

//     // --- GLOBAL STATE ---
//     let allEmployeeData = [];
//     let currentlyViewedEmployeeId = null;

//     // --- CORE DATA FETCHING ---
//     const fetchData = async () => {
//         try {
//             const employeeSnapshot = await db.collection('employees').get();
//             allEmployeeData = employeeSnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
//             return true;
//         } catch (error) {
//             console.error("Error fetching employee data:", error);
//             showMessage("Data Error", `Could not load data: ${error.message}`, false);
//             return false;
//         }
//     };

//     // --- DASHBOARD RENDERING FUNCTIONS ---
//     const loadDashboardOverview = async () => {
//         await fetchData(); // Ensure data is fresh
//         const attendanceSnapshot = await db.collection('attendance')
//             .where('timestamp', '>=', new Date(new Date().setHours(0, 0, 0, 0)))
//             .get();

//         const totalEmployees = allEmployeeData.length;
//         const todayPresent = attendanceSnapshot.size;
//         const notCheckedIn = totalEmployees - todayPresent;
//         const totalSalary = allEmployeeData.reduce((sum, emp) => sum + (emp.baseSalary || 0), 0);

//         document.getElementById('total-employees-stat').textContent = totalEmployees;
//         document.getElementById('today-present-stat').textContent = todayPresent;
//         document.getElementById('not-checked-in-stat').textContent = notCheckedIn;
//         document.getElementById('avg-salary-stat').textContent = `₹${totalSalary.toLocaleString()}`;
//     };

//     const loadManageEmployees = () => {
//         const tableBody = document.getElementById('admin-table-body');
//         tableBody.innerHTML = '';
//         allEmployeeData.forEach(emp => {
//             tableBody.innerHTML += `
//                 <tr>
//                     <td>${emp.name}</td>
//                     <td>${emp.email}</td>
//                     <td>${emp.phone}</td>
//                     <td>₹${emp.baseSalary.toLocaleString()}</td>
//                     <td class="actions-cell">
//                         <button class="btn btn-danger btn-small delete-employee-btn" data-doc-id="${emp.docId}" data-uid="${emp.uid}" data-name="${emp.name}"><i class="fas fa-trash"></i> Delete</button>
//                     </td>
//                 </tr>`;
//         });

//         // Add event listeners for delete buttons
//         tableBody.querySelectorAll('.delete-employee-btn').forEach(btn => {
//             btn.addEventListener('click', (e) => {
//                 const { docId, uid, name } = e.currentTarget.dataset;
//                 if (confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
//                     // Note: Deleting Firebase Auth users requires a backend (Cloud Function) for security.
//                     // This will only delete the Firestore record.
//                     db.collection('employees').doc(docId).delete().then(() => {
//                         showMessage("Success", `${name} has been removed.`, true);
//                         refreshAllData();
//                     }).catch(err => showMessage("Error", err.message, false));
//                 }
//             });
//         });
//     };
    
//     const listenForAttendance = () => {
//         const attendanceList = document.getElementById('attendance-list');
//         const todayStart = new Date();
//         todayStart.setHours(0, 0, 0, 0);

//         db.collection('attendance')
//             .where('timestamp', '>=', todayStart)
//             .orderBy('timestamp', 'desc')
//             .onSnapshot(snapshot => {
//                 attendanceList.innerHTML = ''; // Clear list
//                 if (snapshot.empty) {
//                     attendanceList.innerHTML = '<li>No attendance marked yet today.</li>';
//                     return;
//                 }
//                 snapshot.forEach(doc => {
//                     const record = doc.data();
//                     const time = record.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
//                     const li = document.createElement('li');
//                     li.innerHTML = `<strong>${record.name}</strong> checked in at ${time}`;
//                     attendanceList.appendChild(li);
//                 });
//             });
//     };

//     const loadAttendanceHistory = async () => {
//         const dateFilterValue = document.getElementById('history-date-filter').value;
//         if (!dateFilterValue) return;

//         const tableBody = document.getElementById('attendance-history-table-body');
//         tableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
        
//         const selectedDate = new Date(dateFilterValue);
//         const start = new Date(selectedDate.setHours(0, 0, 0, 0));
//         const end = new Date(selectedDate.setHours(23, 59, 59, 999));
        
//         const snapshot = await db.collection('attendance')
//             .where('timestamp', '>=', start)
//             .where('timestamp', '<=', end)
//             .orderBy('timestamp', 'desc')
//             .get();

//         tableBody.innerHTML = '';
//         if (snapshot.empty) {
//             tableBody.innerHTML = `<tr><td colspan="4">No records found for ${formatDate(selectedDate)}.</td></tr>`;
//         } else {
//             snapshot.forEach(doc => {
//                 const data = doc.data();
//                 const time = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
//                 tableBody.innerHTML += `
//                     <tr>
//                         <td>${formatDate(data.timestamp.toDate())}</td>
//                         <td>${data.name}</td>
//                         <td>${data.email}</td>
//                         <td>${time}</td>
//                     </tr>`;
//             });
//         }
//     };
    
//     const loadSalaryAdvanceSection = () => {
//         const employeeList = document.getElementById('employee-advance-list');
//         employeeList.innerHTML = '';
//         allEmployeeData.forEach(emp => {
//             const li = document.createElement('li');
//             li.dataset.employeeDocId = emp.docId;
//             li.innerHTML = `<span class="employee-name">${emp.name}</span><span class="employee-id">${emp.email}</span>`;
//             li.addEventListener('click', () => showAdvanceDetailsModal(emp.docId));
//             employeeList.appendChild(li);
//         });
//     };
    
//     const showAdvanceDetailsModal = async (docId) => {
//         currentlyViewedEmployeeId = docId;
//         const employee = allEmployeeData.find(emp => emp.docId === docId);
//         if (!employee) return;
        
//         document.getElementById('adv-modal-name').textContent = employee.name;

//         const historyBody = document.getElementById('adv-history-body');
//         historyBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
        
//         const advancesSnapshot = await db.collection('employees').doc(docId).collection('advances').orderBy('date', 'desc').get();
//         historyBody.innerHTML = '';
//         if(advancesSnapshot.empty) {
//             historyBody.innerHTML = '<tr><td colspan="2">No advances this month.</td></tr>';
//         } else {
//             advancesSnapshot.forEach(doc => {
//                 const advance = doc.data();
//                 historyBody.innerHTML += `<tr>
//                     <td>${formatDate(advance.date.toDate())}</td>
//                     <td>₹${advance.amount}</td>
//                 </tr>`;
//             });
//         }
//         showModal(document.getElementById('advance-details-modal'));
//     };

//     const handleRecordAdvance = async (e) => {
//         e.preventDefault();
//         const amount = parseFloat(document.getElementById('advance-amount').value);
//         if (!currentlyViewedEmployeeId || !amount || amount <= 0) {
//             return showMessage("Error", "Invalid amount.", false);
//         }

//         try {
//             await db.collection('employees').doc(currentlyViewedEmployeeId).collection('advances').add({
//                 amount: amount,
//                 date: firebase.firestore.Timestamp.now()
//             });
//             showMessage("Success", "Advance recorded.", true);
//             e.target.reset();
//             showAdvanceDetailsModal(currentlyViewedEmployeeId); // Refresh modal
//         } catch (error) {
//             showMessage("Error", error.message, false);
//         }
//     };
    
//     const refreshAllData = async () => {
//         await fetchData();
//         const activeSection = document.querySelector('.content-section.active').id;
        
//         if (activeSection === 'dashboard-overview-content') loadDashboardOverview();
//         if (activeSection === 'manage-employees-content') loadManageEmployees();
//     };

//     // --- INITIALIZATION ---
//     function initializeAdminDashboard() {
//         // Initial data load
//         fetchData().then(() => {
//             loadDashboardOverview();
//         });
        
//         // Navigation
//         const navLinks = document.querySelectorAll('.sidebar-nav a');
//         const contentSections = document.querySelectorAll('.content-section');
//         const pageTitle = document.getElementById('page-title');

//         const activateSection = (sectionId, navId, title) => {
//             contentSections.forEach(section => section.classList.remove('active'));
//             document.getElementById(sectionId).classList.add('active');
//             navLinks.forEach(link => link.classList.remove('active'));
//             document.getElementById(navId).classList.add('active');
//             pageTitle.textContent = title;
//         };

//         const navActions = {
//             'nav-dashboard': () => { activateSection('dashboard-overview-content', 'nav-dashboard', 'Dashboard Overview'); loadDashboardOverview(); },
//             'nav-employees': () => { activateSection('manage-employees-content', 'nav-employees', 'Manage Employees'); loadManageEmployees(); },
//             'nav-attendance': () => { activateSection('attendance-system-content', 'nav-attendance', "Today's Attendance Feed"); listenForAttendance(); },
//             'nav-history': () => {
//                  activateSection('attendance-history-content', 'nav-history', 'Attendance History');
//                  document.getElementById('history-date-filter').valueAsDate = new Date();
//                  loadAttendanceHistory();
//             },
//             'nav-advances': () => { activateSection('salary-advances-content', 'nav-advances', 'Salary Advances'); loadSalaryAdvanceSection(); },
//             'nav-reports': () => activateSection('reports-analytics-content', 'nav-reports', 'Payroll Reports'),
//         };
        
//         navLinks.forEach(link => {
//             link.addEventListener('click', (e) => {
//                 e.preventDefault();
//                 navActions[e.currentTarget.id]();
//             });
//         });
        
//         // Event Listeners
//         document.getElementById('adminLogoutBtn').addEventListener('click', () => auth.signOut());
//         document.getElementById('enrollBtn').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
//         document.getElementById('quick-enroll-btn').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
//         document.getElementById('close-enroll-modal').addEventListener('click', hideModals);
//         document.getElementById('filterAttendanceBtn').addEventListener('click', loadAttendanceHistory);
//         document.getElementById('close-advance-details-modal').addEventListener('click', hideModals);
//         document.getElementById('close-message-modal').addEventListener('click', hideModals);

//         // Employee Enrollment Form
//         document.getElementById('enroll-form').addEventListener('submit', async (e) => {
//             e.preventDefault();
//             const name = document.getElementById('name').value;
//             const email = document.getElementById('email').value;
//             const password = document.getElementById('password').value;
//             const phone = document.getElementById('phone').value;
//             const aadhar = document.getElementById('aadhar').value;
//             const baseSalary = parseFloat(document.getElementById('salary').value);

//             if (password.length < 6) {
//                 return showMessage("Error", "Password must be at least 6 characters.", false);
//             }
            
//             try {
//                 // IMPORTANT: This creates the user in Firebase Auth. But since we are logged in as admin,
//                 // this can cause a conflict where the admin is logged out. A proper solution uses
//                 // Cloud Functions, but for this client-side project, we proceed with this known limitation.
//                 const tempApp = firebase.initializeApp(firebase.app().options, 'secondary');
//                 const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
//                 const uid = userCredential.user.uid;
//                 await tempApp.auth().signOut(); // Sign out the temporary user
                
//                 // Now save details to Firestore
//                 await db.collection('employees').doc(uid).set({
//                     uid: uid, name, email, phone, aadhar, baseSalary
//                 });
                
//                 await db.collection('users').doc(uid).set({
//                     name: name,
//                     email: email
//                 });

//                 hideModals();
//                 showMessage("Success", "Employee enrolled successfully!", true);
//                 e.target.reset();
//                 refreshAllData();

//             } catch (error) {
//                  if (error.code === 'auth/email-already-in-use') {
//                     showMessage('Error', 'This email is already registered.', false);
//                 } else {
//                     showMessage('Error', `An error occurred: ${error.message}`, false);
//                 }
//                 console.error("Enrollment error:", error);
//             }
//         });

//         document.getElementById('record-advance-form').addEventListener('submit', handleRecordAdvance);
//     }
// });