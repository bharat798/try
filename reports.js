document.addEventListener('DOMContentLoaded', () => {
    let fullYearData = {};
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    document.addEventListener('loadReports', initializeReports);

    function initializeReports() {
        const yearSelector = document.getElementById('report-year-selector');
        const monthSelector = document.getElementById('report-month-selector');
        const currentYear = new Date().getFullYear();
        if (yearSelector.options.length > 0) { // Only fetch if not already initialized
            fetchReportData(yearSelector.value);
            return;
        }

        for (let i = currentYear; i >= currentYear - 5; i--) {
            yearSelector.innerHTML += `<option value="${i}">${i}</option>`;
        }
        monthSelector.value = new Date().getMonth();

        yearSelector.addEventListener('change', () => fetchReportData(yearSelector.value));
        monthSelector.addEventListener('change', () => renderReport(monthSelector.value));
        document.getElementById('report-list-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('view-personal-report-btn')) {
                showPersonalReportModal(e.target.dataset.uid);
            }
        });
        document.getElementById('close-personal-report-modal').addEventListener('click', () => document.getElementById('modal-container').classList.remove('show'));
        
        fetchReportData(currentYear);
    }

    async function fetchReportData(year) {
        document.getElementById('report-list-container').innerHTML = '<p>Loading report data...</p>';
        const empSnap = await db.collection('employees').get();
        const employees = empSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31, 23, 59, 59);

        const attenSnap = await db.collection('attendance').where('timestamp', '>=', start).where('timestamp', '<=', end).get();
        const advancesPromises = employees.map(emp => db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', start).where('date', '<=', end).get());
        const allAdvancesSnapshots = await Promise.all(advancesPromises);

        const attendanceByUid = {};
        attenSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!attendanceByUid[data.userId]) attendanceByUid[data.userId] = [];
            attendanceByUid[data.userId].push(data.timestamp.toDate());
        });

        const advancesByUid = {};
        employees.forEach((emp, index) => {
            advancesByUid[emp.uid] = allAdvancesSnapshots[index].docs.map(doc => ({ ...doc.data(), date: doc.data().date.toDate() }));
        });
        
        fullYearData = {};
        employees.forEach(emp => {
            fullYearData[emp.uid] = Array(12).fill(null).map((_, month) => {
                const presentDays = (attendanceByUid[emp.uid] || []).filter(d => d.getMonth() === month).length;
                const totalAdvances = (advancesByUid[emp.uid] || []).filter(d => d.date.getMonth() === month).reduce((sum, adv) => sum + adv.amount, 0);
                const earnedSalary = (emp.baseSalary / 30) * presentDays;
                return {
                    name: emp.name,
                    presentDays,
                    earnedSalary: Math.round(earnedSalary),
                    totalAdvances,
                    netPayable: Math.round(Math.max(0, earnedSalary - totalAdvances))
                };
            });
        });
        renderReport(document.getElementById('report-month-selector').value);
    }

    function renderReport(month) {
        const container = document.getElementById('report-list-container');
        let html = '<div class="table-responsive"><table class="data-table report-table"><thead><tr><th>Employee Name</th><th>Present Days</th><th>Earned Salary</th><th>Advances</th><th>Net Payable</th><th>Actions</th></tr></thead><tbody>';
        let hasData = false;
        for (const uid in fullYearData) {
            const data = fullYearData[uid][month];
            if (data && (data.presentDays > 0 || data.totalAdvances > 0)) {
                hasData = true;
                html += `
                    <tr>
                        <td>${data.name}</td>
                        <td>${data.presentDays}</td>
                        <td>₹${data.earnedSalary.toLocaleString('en-IN')}</td>
                        <td>₹${data.totalAdvances.toLocaleString('en-IN')}</td>
                        <td><strong>₹${data.netPayable.toLocaleString('en-IN')}</strong></td>
                        <td><a href="#" class="view-personal-report-btn" data-uid="${uid}">View Full Report</a></td>
                    </tr>`;
            }
        }
        if (!hasData) {
            html += '<tr><td colspan="6">No payroll data for this period.</td></tr>';
        }
        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    function showPersonalReportModal(uid) {
        const empYearData = fullYearData[uid];
        if (!empYearData) return;
        
        document.getElementById('personal-report-name').textContent = empYearData[0].name;
        const tableBody = document.getElementById('personal-report-table-body');
        tableBody.innerHTML = empYearData.map((monthData, month) => {
            if (monthData.presentDays > 0 || monthData.totalAdvances > 0) {
                return `
                    <tr>
                        <td>${months[month]}</td>
                        <td>${monthData.presentDays}</td>
                        <td>₹${monthData.earnedSalary.toLocaleString('en-IN')}</td>
                        <td>₹${monthData.totalAdvances.toLocaleString('en-IN')}</td>
                        <td><strong>₹${monthData.netPayable.toLocaleString('en-IN')}</strong></td>
                    </tr>`;
            }
            return '';
        }).join('');
        
        document.getElementById('modal-container').classList.add('show');
        document.getElementById('personal-report-modal').style.display = 'block';
    }
});