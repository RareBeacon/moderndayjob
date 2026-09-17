import 'package:flutter/material.dart';

import '../agent/agent_screen.dart';
import '../applications/applications_screen.dart';
import '../home/home_screen.dart';
import '../jobs/jobs_screen.dart';
import '../profile/profile_screen.dart';

/// The five-tab mobile navigation. Each destination is a real screen; the tab
/// index always reflects what is on screen.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  static const int homeIndex = 0;
  static const int jobsIndex = 1;
  static const int agentIndex = 2;
  static const int applicationsIndex = 3;
  static const int profileIndex = 4;

  @override
  State<AppShell> createState() => AppShellState();
}

class AppShellState extends State<AppShell> {
  int _index = AppShell.homeIndex;

  /// Lets a child screen (e.g. a Home quick action) move the shell to another
  /// tab without pushing a duplicate route.
  void goTo(int index) {
    if (index < 0 || index > 4 || index == _index) return;
    setState(() => _index = index);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const <Widget>[
          HomeScreen(),
          JobsScreen(),
          AgentScreen(),
          ApplicationsScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: goTo,
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.work_outline),
            selectedIcon: Icon(Icons.work),
            label: 'Jobs',
          ),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon: Icon(Icons.auto_awesome),
            label: 'AI Agent',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Applications',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
